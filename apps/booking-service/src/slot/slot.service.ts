import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  SlotStatus,
  WorkigEntity,
} from '@app/common/database/schemas/common.enums';
import { CacheService } from '@app/common/cache/cache.service';

import {
  AppointmentSlot,
  AppointmentSlotDocument,
} from '@app/common/database/schemas/slot.schema';
import {
  AvailableSlotDto,
  GetAvailableSlotsDto,
  GroupedAvailableSlotsDto,
} from './dto/get-avalible-slot.dto';
import {
  Doctor,
  DoctorDocument,
} from '@app/common/database/schemas/doctor.schema';
import { getSyriaDate } from '@app/common/utils/get-syria-date';

@Injectable()
export class SlotGenerationService {
  private readonly logger = new Logger(SlotGenerationService.name);
  constructor(
    @InjectModel(AppointmentSlot.name)
    private slotModel: Model<AppointmentSlotDocument>,
    @InjectModel(Doctor.name) private doctorModel: Model<DoctorDocument>,
    private readonly cacheManager: CacheService,
  ) {}

  /**
   * Invalidate slot-related caches
   */

  async getAvailableSlots(
    query: GetAvailableSlotsDto,
  ): Promise<GroupedAvailableSlotsDto> {
    this.logger.log(`Getting available slots for doctor ${query.doctorId}`);

    if (!Types.ObjectId.isValid(query.doctorId)) {
      throw new BadRequestException('Invalid doctor ID');
    }

    const cacheKey = `slots:available:${query.doctorId}:${query.date || ''}:${query.startDate || 'default'}:${query.endDate || 'default'}`;
    const cached =
      await this.cacheManager.get<GroupedAvailableSlotsDto>(cacheKey);
    if (cached) {
      this.logger.debug(`Returning cached grouped slots for ${query.doctorId}`);
      return cached;
    }

    const filter: any = {
      doctorId: new Types.ObjectId(query.doctorId),
      status: SlotStatus.AVAILABLE,
    };

    const today = getSyriaDate();

    let startDate: Date;
    let endDate: Date;

    // Helper: تحويل تاريخ سوري YYYY-MM-DD إلى UTC range مع مراعاة offset +3
    // Syria midnight (00:00 UTC+3) = previous day 21:00 UTC
    // Syria end of day (23:59:59 UTC+3) = same day 20:59:59 UTC
    const toSyriaUTCRange = (year: number, month: number, day: number) => ({
      start: new Date(Date.UTC(year, month - 1, day - 1, 21, 0, 0, 0)),
      end: new Date(Date.UTC(year, month - 1, day, 20, 59, 59, 999)),
    });

    if (query.date) {
      const [year, month, day] = query.date.split('-').map(Number);
      const { start, end } = toSyriaUTCRange(year, month, day);

      // مقارنة مع اليوم الحالي بتوقيت سوريا
      const todayStart = new Date(
        Date.UTC(
          today.getFullYear(),
          today.getMonth(),
          today.getDate() - 1,
          21,
          0,
          0,
          0,
        ),
      );

      if (start.getTime() < todayStart.getTime()) {
        throw new BadRequestException('Date must be today or greater');
      }

      startDate = start;
      endDate = end;
    } else {
      if (query.startDate) {
        const [y, m, d] = query.startDate.split('-').map(Number);
        startDate = toSyriaUTCRange(y, m, d).start;
      } else {
        // اليوم كـ Syria UTC range
        startDate = new Date(
          Date.UTC(
            today.getFullYear(),
            today.getMonth(),
            today.getDate() - 1,
            21,
            0,
            0,
            0,
          ),
        );
      }

      if (query.endDate) {
        const [y, m, d] = query.endDate.split('-').map(Number);
        endDate = toSyriaUTCRange(y, m, d).end;
      } else {
        endDate = new Date(startDate.getTime() + 30 * 24 * 60 * 60 * 1000);
      }

      if (startDate.getTime() > endDate.getTime()) {
        throw new BadRequestException(
          'startDate cannot be greater than endDate',
        );
      }
    }

    // ✅ تطبيق فلتر التاريخ على الـ query
    filter.date = { $gte: startDate, $lte: endDate };

    const doctor = await this.doctorModel.findById(query.doctorId).exec();
    if (!doctor) {
      throw new NotFoundException(`Doctor with ID ${query.doctorId} not found`);
    }

    const doctorName = `${doctor.firstName} ${doctor.middleName} ${doctor.lastName}`;

    const slots = await this.slotModel
      .find(filter)
      .sort({ date: 1, startTime: 1 })
      .limit(500)
      .lean()
      .exec();

    const grouped: GroupedAvailableSlotsDto = {
      clinic: { data: [], total: 0 },
      hospital: { data: [], total: 0 },
      center: { data: [], total: 0 },
    };

    for (const slot of slots) {
      const mapped: AvailableSlotDto = {
        slotId: slot._id.toString(),
        doctorId: slot.doctorId.toString(),
        doctorName,
        date: slot.date,
        dayOfWeek: slot.dayOfWeek,
        startTime: slot.startTime,
        endTime: slot.endTime,
        duration: slot.duration,
        price: slot.price || doctor.inspectionPrice || 0,
        location: slot.location,
        status: slot.status,
      };

      const locationType = slot.location?.type;

      if (locationType === WorkigEntity.CLINIC) {
        grouped.clinic.data.push(mapped);
      } else if (locationType === WorkigEntity.HOSPITAL) {
        grouped.hospital.data.push(mapped);
      } else if (locationType === WorkigEntity.CENTER) {
        grouped.center.data.push(mapped);
      }
    }

    grouped.clinic.total = grouped.clinic.data.length;
    grouped.hospital.total = grouped.hospital.data.length;
    grouped.center.total = grouped.center.data.length;

    await this.cacheManager.set(cacheKey, grouped, 120, 7200);

    this.logger.log(
      `Found slots for doctor ${query.doctorId} — clinic: ${grouped.clinic.total}, hospital: ${grouped.hospital.total}, center: ${grouped.center.total}`,
    );

    return grouped;
  }
}
