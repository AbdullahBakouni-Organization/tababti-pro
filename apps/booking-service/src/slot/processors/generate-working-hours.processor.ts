import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  AppointmentSlot,
  AppointmentSlotDocument,
} from '@app/common/database/schemas/slot.schema';
import {
  SlotStatus,
  Days,
  WorkigEntity,
} from '@app/common/database/schemas/common.enums';
import { SlotGenerationEvent } from '@app/common/kafka/interfaces/kafka-event.interface'; // adjust path
import { getSyriaDate } from '@app/common/utils/get-syria-date'; // adjust path
import { CacheService } from '@app/common/cache/cache.service';

export interface SlotGenerationJobData {
  eventType: 'SLOTS_GENERATE';
  timestamp: string | Date;
  doctorId: string;
  WorkingHours: Array<{
    day: Days;
    location: {
      type: WorkigEntity;
      entity_name: string;
      address: string;
    };
    startTime: string;
    endTime: string;
  }>;
  inspectionDuration: number;
  inspectionPrice?: number;
  doctorInfo: {
    fullName: string;
    [key: string]: any;
  };
}

@Processor('WORKING_HOURS_GENERATE')
export class SlotGenerationProcessor {
  private readonly logger = new Logger(SlotGenerationProcessor.name);

  // How many weeks ahead to generate slots — keep same as your original service
  private readonly SLOT_GENERATION_WEEKS = 12;
  private readonly CACHE_TTL = 3600;

  constructor(
    @InjectModel(AppointmentSlot.name)
    private slotModel: Model<AppointmentSlotDocument>,
    private readonly cacheManager: CacheService,
  ) {
    this.logger.log(`[Slot Generation Job] Processing for doctor`);
  }

  /* -------------------------------------------------------------------------- */
  /*                              BULL JOB HANDLER                               */
  /* -------------------------------------------------------------------------- */

  @Process('PROCESS_WORKING_HOURS_GENERATE')
  async handleSlotGeneration(job: Job<SlotGenerationJobData>): Promise<void> {
    const { doctorId } = job.data;

    this.logger.log(
      `[Slot Generation Job] Processing for doctor ${doctorId} | Job ID: ${job.id}`,
    );

    // Update job progress
    await job.progress(0);

    try {
      // Build a SlotGenerationEvent-like shape from the job data
      // to keep generateSlots() unchanged
      const event: SlotGenerationEvent = {
        eventType: job.data.eventType,
        timestamp: new Date(job.data.timestamp),
        data: {
          doctorId: job.data.doctorId,
          WorkingHours: job.data.WorkingHours,
          inspectionDuration: job.data.inspectionDuration,
          inspectionPrice: job.data.inspectionPrice,
          doctorInfo: job.data.doctorInfo,
        },
      };

      await job.progress(10);

      const slots = await this.generateSlots(event);

      await job.progress(80);

      this.logger.log(
        `[Slot Generation Job] Generated ${slots.length} slots for doctor ${doctorId}`,
      );

      // Cache the generated slots count for monitoring — same as original
      await this.cacheManager.set(
        `slots:generated:${doctorId}`,
        slots.length,
        this.CACHE_TTL,
      );

      await job.progress(100);

      this.logger.log(
        `[Slot Generation Job] ✅ Completed for doctor ${doctorId}`,
      );
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `[Slot Generation Job] ❌ Failed for doctor ${doctorId}: ${err.message}`,
        err.stack,
      );
      // Re-throw so Bull marks the job as failed and triggers retries
      throw error;
    }
  }

  /* -------------------------------------------------------------------------- */
  /*                          UNCHANGED CORE LOGIC                               */
  /* -------------------------------------------------------------------------- */

  private async generateSlots(
    event: SlotGenerationEvent,
  ): Promise<AppointmentSlot[]> {
    const {
      doctorId,
      WorkingHours,
      inspectionDuration,
      inspectionPrice,
      doctorInfo,
    } = event.data;

    const slots: Partial<AppointmentSlot>[] = [];
    const today = getSyriaDate();

    for (let week = 0; week < this.SLOT_GENERATION_WEEKS; week++) {
      for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
        const currentDate = new Date(today);
        currentDate.setDate(today.getDate() + week * 7 + dayOffset);

        // ✅ Always calculate day from the SAME date object
        const dayOfWeek = this.getDayName(currentDate.getUTCDay());

        const dayWorkingHours = WorkingHours.filter(
          (wh) => wh.day.toLowerCase() === dayOfWeek.toLowerCase(),
        );

        const doctorObjectId = new Types.ObjectId(doctorId);

        for (const wh of dayWorkingHours) {
          slots.push(
            ...this.generateSlotsForDay(
              doctorObjectId,
              currentDate,
              dayOfWeek as Days,
              wh.startTime,
              wh.endTime,
              inspectionDuration,
              wh.location,
              inspectionPrice,
              doctorInfo,
            ),
          );
        }
      }
    }

    const createdSlots = await this.batchInsertSlots(slots);
    await this.invalidateSlotCaches(doctorId);
    return createdSlots;
  }

  /* -------------------------------------------------------------------------- */
  /*                          DAILY SLOT GENERATION                              */
  /* -------------------------------------------------------------------------- */

  private generateSlotsForDay(
    doctorId: Types.ObjectId,
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

      // ✅ Date is normalized and UTC-safe
      const slotDate = new Date(date);
      slotDate.setUTCHours(0, 0, 0, 0);

      slots.push({
        doctorId: doctorId,
        status: SlotStatus.AVAILABLE,
        date: slotDate,
        startTime: `${String(slotStartHour).padStart(2, '0')}:${String(
          slotStartMin,
        ).padStart(2, '0')}`,
        endTime: `${String(slotEndHour).padStart(2, '0')}:${String(
          slotEndMin,
        ).padStart(2, '0')}`,
        dayOfWeek,
        duration,
        price,
        location,
        doctorInfo: {
          fullName: doctorInfo.fullName,
        },
        isRecurring: true,
        workingHoursVersion: 0,
      });

      currentMinutes += duration;
    }

    return slots;
  }

  /* -------------------------------------------------------------------------- */
  /*                              BATCH INSERT                                   */
  /* -------------------------------------------------------------------------- */

  private async batchInsertSlots(
    slots: Partial<AppointmentSlot>[],
  ): Promise<AppointmentSlot[]> {
    if (slots.length === 0) return [];

    const BATCH_SIZE = 100;
    const createdSlots: AppointmentSlot[] = [];

    for (let i = 0; i < slots.length; i += BATCH_SIZE) {
      const batch = slots.slice(i, i + BATCH_SIZE);
      try {
        const inserted = await this.slotModel.insertMany(batch, {
          ordered: false, // continue on duplicate key errors
        });
        createdSlots.push(...(inserted as unknown as AppointmentSlot[]));
      } catch (error: any) {
        // Ignore duplicate key errors (code 11000), re-throw others
        if (error?.code !== 11000) {
          throw error;
        }
        this.logger.warn(
          `[Slot Generation] Skipped duplicate slots in batch ${i / BATCH_SIZE + 1}`,
        );
      }
    }

    return createdSlots;
  }

  /* -------------------------------------------------------------------------- */
  /*                            CACHE INVALIDATION                               */
  /* -------------------------------------------------------------------------- */

  private async invalidateSlotCaches(doctorId: string): Promise<void> {
    try {
      // Invalidate all cache keys related to this doctor's slots
      // Adjust these keys to match whatever your service uses
      const keysToDelete = [
        `slots:doctor:${doctorId}`,
        `slots:available:${doctorId}`,
        `slots:generated:${doctorId}`,
      ];

      await Promise.all(keysToDelete.map((key) => this.cacheManager.del(key)));

      this.logger.debug(
        `[Slot Generation] Cache invalidated for doctor ${doctorId}`,
      );
    } catch (error) {
      const err = error as Error;
      // Cache invalidation failure should not fail the job
      this.logger.warn(
        `[Slot Generation] Cache invalidation warning: ${err.message}`,
      );
    }
  }

  /* -------------------------------------------------------------------------- */
  /*                              HELPERS                                        */
  /* -------------------------------------------------------------------------- */

  private getDayName(utcDay: number): string {
    const days = [
      'sunday',
      'monday',
      'tuesday',
      'wednesday',
      'thursday',
      'friday',
      'saturday',
    ];
    return days[utcDay];
  }
}
