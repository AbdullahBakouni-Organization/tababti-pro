import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
  ConflictException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';

import { AddWorkingHoursDto } from './dto/add-working-hours.dto';
import {
  UpdateWorkingHoursDto,
  ConflictCheckResponseDto,
} from './dto/update-working-hours.dto';
import {
  Doctor,
  DoctorDocument,
} from '@app/common/database/schemas/doctor.schema';
import { KAFKA_TOPICS } from '@app/common/kafka/events/topics';
import { CacheService } from '@app/common/cache/cache.service';

import { ConflictDetectionService } from './conflict-detection.service';
import { KafkaService } from '@app/common/kafka/kafka.service';
import {
  SlotGenerationEvent,
  WorkingHoursAddedEvent,
} from '@app/common/kafka/interfaces/kafka-event.interface';
import { WorkingHoursUpdateJobData } from './processors/working-hours-update.processor';
// import { WorkingHoursUpdateJobData } from './working-hours-update.processor';
interface WorkingHour {
  day: string;
  startTime: string;
  endTime: string;
  location: {
    type: string;
    entity_name: string;
    address: string;
  };
}

@Injectable()
export class WorkingHoursService {
  private readonly logger = new Logger(WorkingHoursService.name);
  private readonly CACHE_TTL = 86400; // 24 hours

  constructor(
    @InjectModel(Doctor.name) private doctorModel: Model<DoctorDocument>,
    private kafkaProducer: KafkaService,
    private readonly cacheManager: CacheService,
    private readonly conflictDetectionService: ConflictDetectionService,
    @InjectQueue('working-hours-update') private workingHoursQueue: Queue,
  ) {}

  /* -------------------------------------------------------------------------- */
  /*                    INITIAL SETUP: ADD WORKING HOURS                        */
  /*            (Used when doctor first sets up their schedule)                 */
  /* -------------------------------------------------------------------------- */

  /**
   * Add working hours to a doctor (INITIAL SETUP - no conflicts possible)
   * This is for doctors who are setting up their schedule for the first time
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
    // this.publishWorkingHoursAddedEvent(doctor, addWorkingHoursDto);

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

  /* -------------------------------------------------------------------------- */
  /*                    REQUIREMENT 1: PRE-CHECK ROUTE (DRY RUN)                */
  /* -------------------------------------------------------------------------- */

  /**
   * Check for conflicts before updating working hours
   * This is the "dry run" that shows what will be affected
   */
  async checkWorkingHoursConflicts(
    doctorId: string,
    updateDto: UpdateWorkingHoursDto,
  ): Promise<ConflictCheckResponseDto> {
    // Validate doctor ID
    if (!Types.ObjectId.isValid(doctorId)) {
      throw new BadRequestException('Invalid doctor ID');
    }

    // Find doctor
    const doctor = await this.doctorModel.findById(doctorId).exec();
    if (!doctor) {
      throw new NotFoundException(`Doctor with ID ${doctorId} not found`);
    }

    // Validate working hours format
    this.validateWorkingHours(updateDto.workingHours);

    // Detect conflicts
    const { todayConflicts, futureConflicts } =
      await this.conflictDetectionService.detectConflicts(
        doctorId,
        updateDto.workingHours,
      );

    const totalConflicts = todayConflicts.length + futureConflicts.length;
    const hasConflicts = totalConflicts > 0;

    const allConflicts = [...todayConflicts, ...futureConflicts];
    const affectedPatients =
      this.conflictDetectionService.getUniquePatientCount(allConflicts);

    const response: ConflictCheckResponseDto = {
      hasConflicts,
      todayConflicts,
      futureConflicts,
      summary: {
        totalConflicts,
        todayCount: todayConflicts.length,
        futureCount: futureConflicts.length,
        affectedPatients,
      },
      warningMessage: hasConflicts
        ? `Updating working hours will cancel ${totalConflicts} appointment(s) affecting ${affectedPatients} patient(s). ${todayConflicts.length} appointments are scheduled for today.`
        : undefined,
    };

    this.logger.log(
      `Conflict check for doctor ${doctorId}: ${totalConflicts} conflicts found`,
    );

    return response;
  }

  /* -------------------------------------------------------------------------- */
  /*                 REQUIREMENT 2: EXECUTION ROUTE (CONFIRMED UPDATE)          */
  /* -------------------------------------------------------------------------- */

  /**
   * Update working hours and handle conflicts
   * This route actually performs the update after doctor confirms
   */
  async updateWorkingHours(
    doctorId: string,
    updateDto: UpdateWorkingHoursDto,
  ): Promise<{
    message: string;
    doctorId: string;
    workingHours: any[];
    conflicts: {
      todayCount: number;
      futureCount: number;
    };
    jobsQueued: {
      immediate: string | null;
      future: string | null;
    };
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

    // Validate working hours
    this.validateWorkingHours(updateDto.workingHours);

    // Detect conflicts again (to ensure data hasn't changed since pre-check)
    const { todayConflicts, futureConflicts } =
      await this.conflictDetectionService.detectConflicts(
        doctorId,
        updateDto.workingHours,
      );

    const hasConflicts =
      todayConflicts.length > 0 || futureConflicts.length > 0;

    // If conflicts exist and not confirmed, throw error
    if (hasConflicts && !updateDto.confirmUpdate) {
      throw new ConflictException(
        'Conflicts detected. Please confirm the update to proceed.',
      );
    }

    // Update doctor working hours in database
    // doctor.workingHours = updateDto.workingHours;
    // doctor.inspectionDuration = updateDto.inspectionDuration;
    // Days being updated
    const updatedDays = [
      ...new Set(updateDto.workingHours.map((wh) => wh.day)),
    ];

    // Remove only those days
    const remainingWorkingHours = doctor.workingHours.filter(
      (wh) => !updatedDays.includes(wh.day),
    );

    // Merge
    const mergedWorkingHours = [
      ...remainingWorkingHours,
      ...updateDto.workingHours,
    ];

    // Validate final result
    this.validateWorkingHours(mergedWorkingHours);

    // Apply update
    doctor.workingHours = mergedWorkingHours;
    doctor.inspectionDuration = updateDto.inspectionDuration;

    if (updateDto.inspectionPrice !== undefined) {
      doctor.inspectionPrice = updateDto.inspectionPrice;
    }

    if (updateDto.inspectionPrice !== undefined) {
      doctor.inspectionPrice = updateDto.inspectionPrice;
    }

    await doctor.save();

    this.logger.log(
      `Working hours updated for doctor ${doctorId}. Queueing conflict resolution jobs...`,
    );

    // Invalidate cache
    await this.invalidateDoctorCache(doctorId);

    const doctorInfo = {
      _id: doctor._id.toString(),
      fullName: `${doctor.firstName} ${doctor.middleName} ${doctor.lastName}`,
    };

    // Queue jobs based on conflicts
    let immediateJobId: string | null = null;
    let futureJobId: string | null = null;

    // JOB A: Handle today's conflicts (HIGH PRIORITY, IMMEDIATE)
    if (todayConflicts.length > 0) {
      const immediateJob = await this.workingHoursQueue.add(
        'handle-immediate-conflicts',
        {
          newWorkingHours: mergedWorkingHours,
          inspectionDuration: updateDto.inspectionDuration,
          inspectionPrice: updateDto.inspectionPrice,
          doctorInfo,
          conflictedBookingIds: todayConflicts.map((c) => c.bookingId),
          jobType: 'immediate',
        } as WorkingHoursUpdateJobData,
        {
          priority: 1, // Highest priority
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
        },
      );

      immediateJobId = immediateJob.id.toString();
      this.logger.log(
        `Queued immediate conflict job ${immediateJobId} for ${todayConflicts.length} today conflicts`,
      );
    }
    // JOB B: Handle future conflicts (NORMAL PRIORITY, IMMEDIATE)
    // Strategy: Run immediately but with lower priority than Job A
    if (futureConflicts.length > 0) {
      const futureJob = await this.workingHoursQueue.add(
        'handle-future-conflicts',
        {
          newWorkingHours: mergedWorkingHours,
          inspectionDuration: updateDto.inspectionDuration,
          inspectionPrice: updateDto.inspectionPrice,
          doctorInfo,
          conflictedBookingIds: futureConflicts.map((c) => c.bookingId),
          jobType: 'future',
        } as WorkingHoursUpdateJobData,
        {
          priority: 5, // Lower priority than immediate
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 5000,
          },
          delay: 2000, // Start 2 seconds after immediate job
        },
      );

      futureJobId = futureJob.id.toString();
      this.logger.log(
        `Queued future conflict job ${futureJobId} for ${futureConflicts.length} future conflicts`,
      );
    }

    // If no conflicts, publish slot generation event directly
    if (!hasConflicts) {
      this.publishSlotGenerationEvent(doctor, updateDto);
    }

    return {
      message: hasConflicts
        ? 'Working hours updated successfully. Conflict resolution in progress.'
        : 'Working hours updated successfully. New slots are being generated.',
      doctorId: doctor._id.toString(),
      workingHours: doctor.workingHours,
      conflicts: {
        todayCount: todayConflicts.length,
        futureCount: futureConflicts.length,
      },
      jobsQueued: {
        immediate: immediateJobId,
        future: futureJobId,
      },
    };
  }

  /* -------------------------------------------------------------------------- */
  /*                            HELPER METHODS                                  */
  /* -------------------------------------------------------------------------- */

  /**
   * Calculate total number of slots that will be generated
   */
  private calculateTotalSlots(
    workingHours: WorkingHour[],
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
   * Publish working hours added event
   */
  private publishWorkingHoursAddedEvent(
    doctor: DoctorDocument,
    dto: AddWorkingHoursDto | UpdateWorkingHoursDto,
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
   * Validate working hours (reused from original service)
   */
  // private validateWorkingHours(workingHours: WorkingHour[]): void {
  //   const dayLocationMap = new Map<string, WorkingHour[]>();

  //   for (const wh of workingHours) {
  //     const key = `${wh.day}-${wh.location.type}-${wh.location.entity_name}`;

  //     if (!dayLocationMap.has(key)) {
  //       dayLocationMap.set(key, []);
  //     }

  //     const existing = dayLocationMap.get(key)!;

  //     for (const existingWh of existing) {
  //       if (
  //         this.hasTimeOverlap(
  //           wh.startTime,
  //           wh.endTime,
  //           existingWh.startTime,
  //           existingWh.endTime,
  //         )
  //       ) {
  //         throw new BadRequestException(
  //           `Overlapping working hours detected for ${wh.day} at ${wh.location.entity_name}`,
  //         );
  //       }
  //     }

  //     existing.push(wh);
  //   }

  //   for (const wh of workingHours) {
  //     if (!this.isValidTimeRange(wh.startTime, wh.endTime)) {
  //       throw new BadRequestException(
  //         `Invalid time range: start time must be before end time for ${wh.day}`,
  //       );
  //     }
  //   }
  // }
  private validateWorkingHours(workingHours: WorkingHour[]): void {
    const dayMap = new Map<string, WorkingHour[]>();

    for (const wh of workingHours) {
      // 1️⃣ Validate time range first
      if (!this.isValidTimeRange(wh.startTime, wh.endTime)) {
        throw new BadRequestException(
          `Invalid time range: start time must be before end time for ${wh.day}`,
        );
      }

      // 2️⃣ Group by DAY ONLY
      if (!dayMap.has(wh.day)) {
        dayMap.set(wh.day, []);
      }

      const existing = dayMap.get(wh.day)!;

      // 3️⃣ Check overlap with ALL working hours of that day
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
            `Doctor cannot work in two places at the same time on ${wh.day}. Conflict between ${wh.startTime}-${wh.endTime} and ${existingWh.startTime}-${existingWh.endTime}`,
          );
        }
      }

      existing.push(wh);
    }
  }

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

  private isValidTimeRange(startTime: string, endTime: string): boolean {
    const [startHour, startMin] = startTime.split(':').map(Number);
    const [endHour, endMin] = endTime.split(':').map(Number);

    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;

    return startMinutes < endMinutes;
  }

  /**
   * Publish slot generation event (for no-conflict scenarios)
   */

  /**
   * Publish slot generation event (for no-conflict scenarios)
   */
  private publishSlotGenerationEvent(
    doctor: DoctorDocument,
    dto: AddWorkingHoursDto | UpdateWorkingHoursDto,
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
      this.logger.log(
        `Slot generation event published for doctor ${doctor.firstName} ${doctor.lastName}`,
      );
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `Failed to publish slot generation event: ${err.message}`,
        err.stack,
      );
    }
  }

  /**
   * Invalidate doctor cache
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
    }
  }

  /**
   * Get working hours (kept from original service)
   */
  async getWorkingHours(doctorId: string): Promise<any> {
    if (!Types.ObjectId.isValid(doctorId)) {
      throw new BadRequestException('Invalid doctor ID');
    }

    const cacheKey = `doctor:${doctorId}:working-hours`;
    const cached = await this.cacheManager.get(cacheKey);

    if (cached) {
      return cached;
    }

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

    await this.cacheManager.set(cacheKey, result, this.CACHE_TTL, 3600);

    return result;
  }
}
