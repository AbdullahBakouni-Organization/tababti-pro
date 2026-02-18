import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { EventPattern } from '@nestjs/microservices';
import { Days, SlotStatus } from '@app/common/database/schemas/common.enums';
import { CacheService } from '@app/common/cache/cache.service';
import { KAFKA_TOPICS } from '@app/common/kafka/events/topics';
import type {
  SlotGenerationEvent,
  SlotGenerationFutureEvent,
  SlotGenerationTodayEvent,
} from '@app/common/kafka/interfaces/kafka-event.interface';
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
  private readonly CACHE_TTL = 3600; // 1 hour
  private readonly SLOT_GENERATION_WEEKS = 12; // Generate slots for next 12 weeks
  constructor(
    @InjectModel(AppointmentSlot.name)
    private slotModel: Model<AppointmentSlotDocument>,
    @InjectModel(Doctor.name) private doctorModel: Model<DoctorDocument>,
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

  @EventPattern(KAFKA_TOPICS.SLOTS_GENERATE_FOR_TODAY)
  async processSlotGenerationForToday(
    event: SlotGenerationTodayEvent,
  ): Promise<void> {
    this.logger.log(
      `Received slot generation event for today to a doctor ${event.data.doctorId}`,
    );

    try {
      const slots = await this.generateTodaySlots(event);
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

  @EventPattern(KAFKA_TOPICS.SLOTS_GENERATE_FOR_FUTURE)
  async processSlotGenerationFor(
    event: SlotGenerationFutureEvent,
  ): Promise<void> {
    this.logger.log(
      `Received slot generation event for future to a doctor ${event.data.doctorInfo.fullName}`,
    );

    try {
      const slots = await this.generateFutureSlots(event);
      this.logger.log(
        `Successfully generated
        slots for doctor ${event.data.doctorId}`,
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

  async generateTodaySlots(
    event: SlotGenerationTodayEvent,
  ): Promise<AppointmentSlot[]> {
    const {
      doctorId,
      workingHours,
      inspectionDuration,
      inspectionPrice,
      doctorInfo,
    } = event.data;

    const slots: Partial<AppointmentSlot>[] = [];
    const today = getSyriaDate();
    const dayOfWeek = new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      timeZone: 'Asia/Damascus',
    }).format(new Date());

    console.log('=== DEBUG generateTodaySlots ===');
    console.log('today (getSyriaDate):', today);
    console.log('dayOfWeek detected:', dayOfWeek);
    console.log(
      'workingHours received:',
      JSON.stringify(workingHours, null, 2),
    );
    console.log('inspectionDuration:', inspectionDuration);

    const dayWorkingHours = workingHours.filter(
      (wh) => wh.day.toLowerCase() === dayOfWeek.toLowerCase(),
    );

    console.log(
      'dayWorkingHours matched:',
      JSON.stringify(dayWorkingHours, null, 2),
    );

    for (const wh of dayWorkingHours) {
      slots.push(
        ...this.generateSlotsForDay(
          doctorId,
          today,
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
    console.log('Generated BEFORE insert:', slots.length);
    console.log('Slots preview:', slots.slice(0, 2));

    await this.invalidateSlotCaches(doctorId);
    const createdSlots = await this.batchInsertSlots(slots);

    this.logger.log(
      `Generated ${createdSlots.length} slots for today for doctor ${doctorId}`,
    );

    return createdSlots;
  }
  /**
   * Get current date in Syria timezone
   */
  // private getSyriaDate(): Date {
  //   const now = new Date();

  //   // Syria is UTC+3 (no DST)
  //   const SYRIA_OFFSET_MINUTES = 3 * 60;

  //   // Get UTC time in milliseconds
  //   const utcTime = now.getTime() + now.getTimezoneOffset() * 60 * 1000;

  //   // Convert UTC → Syria time
  //   const syriaTime = new Date(utcTime + SYRIA_OFFSET_MINUTES * 60 * 1000);

  //   // Normalize to start of day in Syria
  //   syriaTime.setHours(0, 0, 0, 0);

  //   return syriaTime;
  // }

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
    const today = getSyriaDate();

    for (let week = 0; week < this.SLOT_GENERATION_WEEKS; week++) {
      for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
        const currentDate = new Date(today);
        currentDate.setDate(today.getDate() + week * 7 + dayOffset);

        // ✅ Always calculate day from the SAME date object
        const dayOfWeek = this.getDayName(currentDate.getUTCDay());

        const dayWorkingHours = workingHours.filter(
          (wh) => wh.day.toLowerCase() === dayOfWeek.toLowerCase(),
        );

        for (const wh of dayWorkingHours) {
          slots.push(
            ...this.generateSlotsForDay(
              doctorId,
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

      // ✅ Date is normalized and UTC-safe
      const slotDate = new Date(date);
      slotDate.setUTCHours(0, 0, 0, 0);

      slots.push({
        doctorId: doctorId as any,
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
      });

      currentMinutes += duration;
    }

    return slots;
  }

  private async generateFutureSlots(
    event: SlotGenerationFutureEvent,
  ): Promise<Partial<AppointmentSlot>[]> {
    const {
      doctorId,
      workingHours,
      inspectionDuration,
      inspectionPrice,
      doctorInfo,
    } = event.data;
    const today = getSyriaDate();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const slots: Partial<AppointmentSlot>[] = [];
    const WEEKS = 12;

    // Start from day 1 (tomorrow), not day 0 (today)
    for (let week = 0; week < WEEKS; week++) {
      for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
        const currentDate = new Date(tomorrow);
        currentDate.setDate(tomorrow.getDate() + week * 7 + dayOffset);

        const dayOfWeek = this.getDayName(currentDate.getUTCDay());

        const dayWorkingHours = workingHours.filter(
          (wh) => wh.day.toLowerCase() === dayOfWeek.toLowerCase(),
        );

        for (const wh of dayWorkingHours) {
          slots.push(
            ...this.generateSlotsForDay(
              doctorId,
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

    // Use your existing batch insert logic
    await this.invalidateSlotCaches(doctorId);
    const createdSlots = await this.batchInsertSlots(slots);
    return createdSlots;
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
  // async getAvailableSlots(
  //   doctorId: string,
  //   startDate: Date,
  //   endDate: Date,
  // ): Promise<AppointmentSlot[]> {
  //   const cacheKey = `slots:available:${doctorId}:${startDate.toISOString()}:${endDate.toISOString()}`;

  //   // Try cache first
  //   const cached = await this.cacheManager.get<AppointmentSlot[]>(cacheKey);
  //   if (cached) {
  //     return cached;
  //   }

  //   // Query database
  //   const slots = await this.slotModel
  //     .find({
  //       doctorId,
  //       status: SlotStatus.AVAILABLE,
  //       date: { $gte: startDate, $lte: endDate },
  //     })
  //     .sort({ date: 1, startTime: 1 })
  //     .lean()
  //     .exec();

  //   // Cache for 5 minutes (slots change frequently)
  //   await this.cacheManager.set(cacheKey, slots, 300);

  //   return slots as AppointmentSlot[];
  // }

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

  /**
   * Delete future slots for a doctor (for regeneration)
   */
  async deleteFutureSlotsForDoctor(doctorId: string): Promise<number> {
    const today = getSyriaDate();

    const result = await this.slotModel.deleteMany({
      doctorId,
      status: SlotStatus.AVAILABLE,
      date: { $gte: today },
    });

    await this.invalidateSlotCaches(doctorId);

    this.logger.log(
      `Deleted ${result.deletedCount} future slots for doctor ${doctorId}`,
    );
    return result.deletedCount;
  }

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
      doctorId: query.doctorId,
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
