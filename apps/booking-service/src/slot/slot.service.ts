import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { EventPattern, MessagePattern, Payload } from '@nestjs/microservices';
import { Days, SlotStatus } from '@app/common/database/schemas/common.enums';
import { CacheService } from '@app/common/cache/cache.service';
import { KAFKA_TOPICS } from '@app/common/kafka/events/topics';
import type { SlotGenerationEvent } from '@app/common/kafka/interfaces/kafka-event.interface';
import {
  AppointmentSlot,
  AppointmentSlotDocument,
} from '@app/common/database/schemas/slot.schema';

@Injectable()
export class SlotGenerationService {
  private readonly logger = new Logger(SlotGenerationService.name);
  private readonly CACHE_TTL = 3600; // 1 hour
  private readonly SLOT_GENERATION_WEEKS = 12; // Generate slots for next 12 weeks

  constructor(
    @InjectModel(AppointmentSlot.name)
    private slotModel: Model<AppointmentSlotDocument>,
    private readonly cacheManager: CacheService,
  ) {}

  /**
   * Listen to slot generation events from Kafka
   */
  @EventPattern(KAFKA_TOPICS.SLOTS_GENERATE)
  async processSlotGeneration(event: SlotGenerationEvent): Promise<void> {
    this.logger.log(
      `Received slot generation event for doctor ${event.data.doctorId}`,
    );

    try {
      const slots = await this.generateSlots(event);
      this.logger.log(
        `Successfully generated ${slots.length} slots for doctor ${event.data.doctorId}`,
      );

      // Cache the generated slots count for monitoring
      await this.cacheManager.set(
        `slots:generated:${event.data.doctorId}`,
        slots.length,
        this.CACHE_TTL,
        3600,
      );
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `Failed to generate slots for doctor ${event.data.doctorId}: ${err.message}`,
        err.stack,
      );
      // In production, you might want to publish this to a dead letter queue
    }
  }

  /**
   * Generate appointment slots based on working hours
   */
  private async generateSlots(
    event: SlotGenerationEvent,
  ): Promise<AppointmentSlot[]> {
    const {
      doctorId,
      workingHours,
      inspectionDuration,
      inspectionPrice,
      doctorInfo,
    } = event.data;

    const slots: Partial<AppointmentSlot>[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Generate slots for the next X weeks
    for (let week = 0; week < this.SLOT_GENERATION_WEEKS; week++) {
      for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
        const currentDate = new Date(today);
        currentDate.setDate(today.getDate() + week * 7 + dayOffset);

        const dayOfWeek = this.getDayName(currentDate.getDay());

        // Find all working hours for this day
        const dayWorkingHours = workingHours.filter(
          (wh) => wh.day.toLowerCase() === dayOfWeek.toLowerCase(),
        );

        for (const wh of dayWorkingHours) {
          const daySlots = this.generateSlotsForDay(
            doctorId,
            currentDate,
            dayOfWeek as Days,
            wh.startTime,
            wh.endTime,
            inspectionDuration,
            wh.location,
            inspectionPrice,
            doctorInfo,
          );

          slots.push(...daySlots);
        }
      }
    }

    // Batch insert with error handling
    const createdSlots = await this.batchInsertSlots(slots);

    // Invalidate relevant caches
    await this.invalidateSlotCaches(doctorId);

    return createdSlots;
  }

  /**
   * Generate slots for a specific day
   */
  private generateSlotsForDay(
    doctorId: string,
    date: Date,
    dayOfWeek: Days,
    startTime: string,
    endTime: string,
    duration: number,
    location: any,
    price: number | undefined,
    doctorInfo: any,
  ): Partial<AppointmentSlot>[] {
    const slots: Partial<AppointmentSlot>[] = [];

    const [startHour, startMin] = startTime.split(':').map(Number);
    const [endHour, endMin] = endTime.split(':').map(Number);

    let currentMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;

    while (currentMinutes + duration <= endMinutes) {
      const slotStartHour = Math.floor(currentMinutes / 60);
      const slotStartMin = currentMinutes % 60;
      const slotEndMinutes = currentMinutes + duration;
      const slotEndHour = Math.floor(slotEndMinutes / 60);
      const slotEndMin = slotEndMinutes % 60;

      const slot: Partial<AppointmentSlotDocument> = {
        doctorId: doctorId as any,
        status: SlotStatus.AVAILABLE,
        date: new Date(date),
        startTime: `${String(slotStartHour).padStart(2, '0')}:${String(slotStartMin).padStart(2, '0')}`,
        endTime: `${String(slotEndHour).padStart(2, '0')}:${String(slotEndMin).padStart(2, '0')}`,
        dayOfWeek,
        location: {
          type: location.type,
          entity_name: location.entity_name,
          address: location.address,
        },
        duration,
        price,
        doctorInfo: {
          fullName: doctorInfo.fullName,
        },
        isRecurring: true,
      };

      slots.push(slot);
      currentMinutes += duration;
    }

    return slots;
  }

  /**
   * Batch insert slots with duplicate handling
   */
  private async batchInsertSlots(
    slots: Partial<AppointmentSlot>[],
  ): Promise<AppointmentSlot[]> {
    const BATCH_SIZE = 1000;
    const createdSlots: AppointmentSlot[] = [];

    for (let i = 0; i < slots.length; i += BATCH_SIZE) {
      const batch = slots.slice(i, i + BATCH_SIZE);

      try {
        // 1. Removed rawResult: true so 'result' is the array of docs
        const docs = await this.slotModel.insertMany(batch, {
          ordered: false,
        });

        // 2. Standard success case
        createdSlots.push(...docs);

        this.logger.debug(
          `Batch ${Math.floor(i / BATCH_SIZE) + 1}: Inserted ${docs.length} slots`,
        );
      } catch (error: any) {
        // 3. Handle Partial Success (ordered: false)
        // Even if some failed, Mongoose returns the successful ones in error.insertedDocs
        if (Array.isArray(error.insertedDocs)) {
          createdSlots.push(...error.insertedDocs);
        }

        // 4. Handle Duplicate Key Errors (E11000)
        if (
          error.code === 11000 ||
          error.writeErrors?.some((e: any) => e.code === 11000)
        ) {
          // Calculate how many succeeded vs failed based on the error data
          const insertedCount = error.insertedDocs?.length || 0;

          this.logger.warn(
            `Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${insertedCount} inserted, ${batch.length - insertedCount} duplicates skipped`,
          );
        } else {
          // If it's NOT a duplicate error (e.g., network/validation), rethrow
          this.logger.error(
            `Batch insert error: ${error.message}`,
            error.stack,
          );
          throw error;
        }
      }
    }

    return createdSlots;
  }

  /**
   * Get day name from day number (0 = Sunday, 1 = Monday, etc.)
   */
  private getDayName(dayNumber: number): string {
    const days = [
      Days.SUNDAY,
      Days.MONDAY,
      Days.TUESDAY,
      Days.WEDNESDAY,
      Days.THURSDAY,
      Days.FRIDAY,
      Days.SATURDAY,
    ];
    return days[dayNumber];
  }

  /**
   * Invalidate slot-related caches
   */
  private async invalidateSlotCaches(doctorId: string): Promise<void> {
    try {
      const cacheKeys = [
        `slots:doctor:${doctorId}`,
        `slots:available:${doctorId}`,
        `slots:generated:${doctorId}`,
      ];

      await Promise.all(cacheKeys.map((key) => this.cacheManager.del(key)));
      this.logger.debug(`Slot caches invalidated for doctor ${doctorId}`);
    } catch (error) {
      const err = error as Error;
      this.logger.warn(`Failed to invalidate slot caches: ${err.message}`);
    }
  }

  /**
   * Get available slots for a doctor (with caching)
   */
  async getAvailableSlots(
    doctorId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<AppointmentSlot[]> {
    const cacheKey = `slots:available:${doctorId}:${startDate.toISOString()}:${endDate.toISOString()}`;

    // Try cache first
    const cached = await this.cacheManager.get<AppointmentSlot[]>(cacheKey);
    if (cached) {
      return cached;
    }

    // Query database
    const slots = await this.slotModel
      .find({
        doctorId,
        status: SlotStatus.AVAILABLE,
        date: { $gte: startDate, $lte: endDate },
      })
      .sort({ date: 1, startTime: 1 })
      .lean()
      .exec();

    // Cache for 5 minutes (slots change frequently)
    await this.cacheManager.set(cacheKey, slots, 300);

    return slots as AppointmentSlot[];
  }

  /**
   * Delete all slots for a doctor (useful when working hours change completely)
   */
  async deleteAllSlotsForDoctor(doctorId: string): Promise<number> {
    const result = await this.slotModel.deleteMany({
      doctorId,
      status: SlotStatus.AVAILABLE, // Only delete available slots
    });

    await this.invalidateSlotCaches(doctorId);

    this.logger.log(
      `Deleted ${result.deletedCount} slots for doctor ${doctorId}`,
    );
    return result.deletedCount;
  }
}
