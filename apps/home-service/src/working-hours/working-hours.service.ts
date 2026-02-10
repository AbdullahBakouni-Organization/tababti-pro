import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { AddWorkingHoursDto } from './dto/add-working-hours.dto';

import {
  Doctor,
  DoctorDocument,
} from '@app/common/database/schemas/doctor.schema';
import { KAFKA_TOPICS } from '@app/common/kafka/events/topics';
import { CacheService } from '@app/common/cache/cache.service';
import {
  SlotGenerationEvent,
  WorkingHoursAddedEvent,
} from '@app/common/kafka/interfaces/kafka-event.interface';
import { KafkaService } from '@app/common/kafka/kafka.service';

@Injectable()
export class WorkingHoursService {
  private readonly logger = new Logger(WorkingHoursService.name);
  private readonly CACHE_TTL = 86400; // 24 hours in seconds

  constructor(
    @InjectModel(Doctor.name) private doctorModel: Model<DoctorDocument>,
    private kafkaProducer: KafkaService,
    private readonly cacheManager: CacheService,
  ) {}

  /**
   * Add working hours to a doctor and trigger slot generation
   */
  async addWorkingHours(
    doctorId: string,
    addWorkingHoursDto: AddWorkingHoursDto,
  ): Promise<{
    message: string;
    doctorId: string;
    workingHours: any[];
    slotsGenerated: number;
    inspectionDuration: number;
  }> {
    // Validate doctor ID
    if (!Types.ObjectId.isValid(doctorId)) {
      throw new BadRequestException('Invalid doctor ID');
    }

    // Find doctor
    const doctor = await this.doctorModel.findById(doctorId).exec();
    if (!doctor) {
      throw new NotFoundException(`Doctor with ID ${doctorId} not found`);
    }

    // Validate working hours don't overlap
    this.validateWorkingHours(addWorkingHoursDto.workingHours);

    // Check if this is the first time adding working hours
    const isFirstTime =
      !doctor.workingHours || doctor.workingHours.length === 0;

    // Update doctor with working hours and inspection details
    doctor.workingHours = addWorkingHoursDto.workingHours;
    doctor.inspectionDuration = addWorkingHoursDto.inspectionDuration;

    if (addWorkingHoursDto.inspectionPrice !== undefined) {
      doctor.inspectionPrice = addWorkingHoursDto.inspectionPrice;
    }

    await doctor.save();

    // Calculate total slots that will be generated
    const totalSlots = this.calculateTotalSlots(
      addWorkingHoursDto.workingHours,
      addWorkingHoursDto.inspectionDuration,
    );

    // Invalidate cached doctor data
    await this.invalidateDoctorCache(doctorId);

    // Publish events
    if (isFirstTime) {
      // Publish slot generation event for booking service
      this.publishSlotGenerationEvent(doctor, addWorkingHoursDto);
    }

    // Publish working hours added event
    this.publishWorkingHoursAddedEvent(doctor, addWorkingHoursDto);

    this.logger.log(
      `Working hours added for doctor ${doctorId}. Slots to be generated: ${totalSlots}`,
    );

    return {
      message: isFirstTime
        ? 'Working hours added successfully. Appointment slots are being generated.'
        : 'Working hours updated successfully.',
      doctorId: doctor._id.toString(),
      workingHours: doctor.workingHours,
      slotsGenerated: totalSlots,
      inspectionDuration: doctor.inspectionDuration,
    };
  }

  /**
   * Validate that working hours don't overlap for the same day and location
   */
  private validateWorkingHours(workingHours: any[]): void {
    const dayLocationMap = new Map<string, any[]>();

    for (const wh of workingHours) {
      const key = `${wh.day}-${wh.location.type}-${wh.location.entity_name}`;

      if (!dayLocationMap.has(key)) {
        dayLocationMap.set(key, []);
      }

      const existing = dayLocationMap.get(key)!;

      // Check for overlaps
      for (const existingWh of existing) {
        if (
          this.hasTimeOverlap(
            wh.startTime,
            wh.endTime,
            existingWh.startTime,
            existingWh.endTime,
          )
        ) {
          throw new BadRequestException(
            `Overlapping working hours detected for ${wh.day} at ${wh.location.entity_name}`,
          );
        }
      }

      existing.push(wh);
    }

    // Validate time logic (start < end)
    for (const wh of workingHours) {
      if (!this.isValidTimeRange(wh.startTime, wh.endTime)) {
        throw new BadRequestException(
          `Invalid time range: start time must be before end time for ${wh.day}`,
        );
      }
    }
  }

  /**
   * Check if two time ranges overlap
   */
  private hasTimeOverlap(
    start1: string,
    end1: string,
    start2: string,
    end2: string,
  ): boolean {
    const [h1, m1] = start1.split(':').map(Number);
    const [h2, m2] = end1.split(':').map(Number);
    const [h3, m3] = start2.split(':').map(Number);
    const [h4, m4] = end2.split(':').map(Number);

    const start1Minutes = h1 * 60 + m1;
    const end1Minutes = h2 * 60 + m2;
    const start2Minutes = h3 * 60 + m3;
    const end2Minutes = h4 * 60 + m4;

    return start1Minutes < end2Minutes && end1Minutes > start2Minutes;
  }

  /**
   * Validate that start time is before end time
   */
  private isValidTimeRange(startTime: string, endTime: string): boolean {
    const [startHour, startMin] = startTime.split(':').map(Number);
    const [endHour, endMin] = endTime.split(':').map(Number);

    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;

    return startMinutes < endMinutes;
  }

  /**
   * Calculate total number of slots that will be generated
   */
  private calculateTotalSlots(
    workingHours: any[],
    inspectionDuration: number,
  ): number {
    let totalSlots = 0;

    for (const wh of workingHours) {
      const [startHour, startMin] = wh.startTime.split(':').map(Number);
      const [endHour, endMin] = wh.endTime.split(':').map(Number);

      const startMinutes = startHour * 60 + startMin;
      const endMinutes = endHour * 60 + endMin;
      const availableMinutes = endMinutes - startMinutes;

      const slotsPerDay = Math.floor(availableMinutes / inspectionDuration);
      totalSlots += slotsPerDay;
    }

    return totalSlots;
  }

  /**
   * Publish slot generation event to booking service via Kafka
   */
  private publishSlotGenerationEvent(
    doctor: DoctorDocument,
    dto: AddWorkingHoursDto,
  ): void {
    const event: SlotGenerationEvent = {
      eventType: 'SLOTS_GENERATE',
      timestamp: new Date(),
      data: {
        doctorId: doctor._id.toString(),
        workingHours: dto.workingHours.map((wh) => ({
          day: wh.day,
          location: {
            type: wh.location.type,
            entity_name: wh.location.entity_name,
            address: wh.location.address,
          },
          startTime: wh.startTime,
          endTime: wh.endTime,
        })),
        inspectionDuration: dto.inspectionDuration,
        inspectionPrice: dto.inspectionPrice,
        doctorInfo: {
          fullName: `${doctor.firstName} ${doctor.middleName} ${doctor.lastName}`,
        },
      },
      metadata: {
        source: 'doctor-service',
        version: '1.0',
      },
    };

    try {
      this.kafkaProducer.emit(KAFKA_TOPICS.SLOTS_GENERATE, event);
      console.log(event);
      this.logger.log(
        `Slot generation event published for doctor ${doctor.firstName} ${doctor.middleName} ${doctor.lastName})`,
      );
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `Failed to publish slot generation event: ${err.message}`,
        err.stack,
      );
      // Don't throw - event publishing should not block the main operation
    }
  }

  /**
   * Publish working hours added event
   */
  private publishWorkingHoursAddedEvent(
    doctor: DoctorDocument,
    dto: AddWorkingHoursDto,
  ): void {
    const event: WorkingHoursAddedEvent = {
      eventType: 'WORKING_HOURS_ADDED',
      timestamp: new Date(),
      data: {
        doctorId: doctor._id.toString(),
        workingHours: dto.workingHours.map((wh) => ({
          day: wh.day,
          location: {
            type: wh.location.type,
            entity_name: wh.location.entity_name,
            address: wh.location.address,
          },
          startTime: wh.startTime,
          endTime: wh.endTime,
        })),
        inspectionDuration: dto.inspectionDuration,
      },
      metadata: {
        source: 'doctor-service',
        version: '1.0',
      },
    };

    try {
      this.kafkaProducer.emit(KAFKA_TOPICS.WORKING_HOURS_ADDED, event);
      this.logger.log(
        `Working hours added event published for doctor ${doctor.firstName} ${doctor.middleName} ${doctor.lastName}`,
      );
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `Failed to publish working hours added event: ${err.message}`,
        err.stack,
      );
    }
  }

  /**
   * Invalidate cached doctor data
   */
  private async invalidateDoctorCache(doctorId: string): Promise<void> {
    try {
      const cacheKeys = [
        `doctor:${doctorId}`,
        `doctor:${doctorId}:working-hours`,
        `doctor:${doctorId}:profile`,
      ];

      await Promise.all(cacheKeys.map((key) => this.cacheManager.del(key)));

      this.logger.debug(`Cache invalidated for doctor ${doctorId}`);
    } catch (error) {
      const err = error as Error;
      this.logger.warn(`Failed to invalidate cache: ${err.message}`);
      // Don't throw - cache invalidation failure should not block the operation
    }
  }

  /**
   * Get doctor's working hours
   */
  async getWorkingHours(doctorId: string): Promise<any> {
    if (!Types.ObjectId.isValid(doctorId)) {
      throw new BadRequestException('Invalid doctor ID');
    }

    // Try to get from cache first
    const cacheKey = `doctor:${doctorId}:working-hours`;
    const cached = await this.cacheManager.get(cacheKey);

    if (cached) {
      this.logger.debug(
        `Working hours retrieved from cache for doctor ${doctorId}`,
      );
      return cached;
    }

    // Get from database
    const doctor = await this.doctorModel
      .findById(doctorId)
      .select('workingHours inspectionDuration inspectionPrice')
      .lean()
      .exec();

    if (!doctor) {
      throw new NotFoundException(`Doctor with ID ${doctorId} not found`);
    }

    const result = {
      doctorId: doctorId,
      workingHours: doctor.workingHours || [],
      inspectionDuration: doctor.inspectionDuration,
      inspectionPrice: doctor.inspectionPrice,
    };

    // Cache the result
    await this.cacheManager.set(cacheKey, result, this.CACHE_TTL, 3600);

    return result;
  }
}
