import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { SlotStatus } from '@app/common/database/schemas/common.enums';
import { CacheService } from '@app/common/cache/cache.service';

import {
  AppointmentSlot,
  AppointmentSlotDocument,
} from '@app/common/database/schemas/slot.schema';
import {
  AvailableSlotDto,
  GetAvailableSlotsDto,
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
  ): Promise<AvailableSlotDto[]> {
    this.logger.log(`Getting available slots for doctor ${query.doctorId}`);

    // Validate doctor ID
    if (!Types.ObjectId.isValid(query.doctorId)) {
      throw new BadRequestException('Invalid doctor ID');
    }

    // Check cache first
    const cacheKey = this.generateCacheKey(query);
    const cached = await this.cacheManager.get<AvailableSlotDto[]>(cacheKey);

    if (cached) {
      this.logger.debug(`Returning cached slots for ${query.doctorId}`);
      return cached;
    }

    // Build query
    const filter: any = {
      doctorId: new Types.ObjectId(query.doctorId),
      status: SlotStatus.AVAILABLE,
    };

    // Date range filter
    const today = getSyriaDate();
    const startDate = query.startDate ? new Date(query.startDate) : today;
    const endDate = query.endDate
      ? new Date(query.endDate)
      : new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days

    filter.date = { $gte: startDate, $lte: endDate };

    // Location filter
    if (query.location) {
      filter['location.type'] = query.location;
    }

    // Get doctor info for response
    const doctor = await this.doctorModel.findById(query.doctorId).exec();
    if (!doctor) {
      throw new NotFoundException(`Doctor with ID ${query.doctorId} not found`);
    }

    const doctorName = `${doctor.firstName} ${doctor.middleName} ${doctor.lastName}`;

    // Query slots
    const slots = await this.slotModel
      .find(filter)
      .sort({ date: 1, startTime: 1 })
      .lean()
      .exec();

    // Map to DTO
    const availableSlots: AvailableSlotDto[] = slots.map((slot) => ({
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
    }));

    // Cache for 5 minutes
    await this.cacheManager.set(cacheKey, availableSlots, 300);

    this.logger.log(
      `Found ${availableSlots.length} available slots for doctor ${query.doctorId}`,
    );

    return availableSlots;
  }

  private generateCacheKey(query: GetAvailableSlotsDto): string {
    const parts = [
      'slots:available',
      query.doctorId,
      query.startDate || 'today',
      query.endDate || '30d',
      query.location || 'all',
    ];
    return parts.join(':');
  }
}
