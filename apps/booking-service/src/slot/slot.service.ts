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

    // Cache key based only on doctorId + date range (no location)
    const cacheKey = `slots:available:${query.doctorId}:${query.startDate || 'default'}:${query.endDate || 'default'}`;
    const cached =
      await this.cacheManager.get<GroupedAvailableSlotsDto>(cacheKey);
    if (cached) {
      this.logger.debug(`Returning cached grouped slots for ${query.doctorId}`);
      return cached;
    }

    // Build query — NO location filter anymore
    const filter: any = {
      doctorId: new Types.ObjectId(query.doctorId),
      status: SlotStatus.AVAILABLE,
    };

    const today = getSyriaDate();

    let startDate: Date;
    let endDate: Date;

    // ✅ NEW: specific date override
    if (query.date) {
      const requestedDate = new Date(query.date);

      // Normalize both to start of day (important)
      requestedDate.setHours(0, 0, 0, 0);
      today.setHours(0, 0, 0, 0);

      if (requestedDate.getTime() < today.getTime()) {
        throw new BadRequestException('Date must be today or greater');
      }

      startDate = requestedDate;
      endDate = requestedDate;
    } else {
      startDate = query.startDate ? new Date(query.startDate) : today;
      endDate = query.endDate
        ? new Date(query.endDate)
        : new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);

      if (startDate.getTime() > endDate.getTime()) {
        throw new BadRequestException(
          'startDate cannot be greater than endDate',
        );
      }
    }

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

    // Group by location type on the backend
    // grouped object
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
