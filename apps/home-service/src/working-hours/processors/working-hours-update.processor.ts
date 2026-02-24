import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  AppointmentSlot,
  AppointmentSlotDocument,
} from '@app/common/database/schemas/slot.schema';
import {
  BookingStatus,
  SlotStatus,
  UserRole,
} from '@app/common/database/schemas/common.enums';
import { KafkaService } from '@app/common/kafka/kafka.service';
import { KAFKA_TOPICS } from '@app/common/kafka/events/topics';
// import { WebSocketService } from './websocket.service'; // You'll need to create this
import {
  Booking,
  BookingDocument,
} from '@app/common/database/schemas/booking.schema';
import {
  SlotGenerationFutureEvent,
  SlotGenerationTodayEvent,
} from '@app/common/kafka/interfaces/kafka-event.interface';
import { getSyriaDate } from '@app/common/utils/get-syria-date';

export interface WorkingHoursUpdateJobData {
  newWorkingHours: any[];
  inspectionDuration: number;
  inspectionPrice?: number | undefined;
  doctorInfo: {
    fullName: string;
    _id: string;
  };
  conflictedBookingIds: string[];
  jobType: 'immediate' | 'future';
}

@Processor('working-hours-update')
export class WorkingHoursUpdateProcessor {
  private readonly logger = new Logger(WorkingHoursUpdateProcessor.name);

  constructor(
    @InjectModel(Booking.name)
    private appointmentModel: Model<BookingDocument>,
    @InjectModel(AppointmentSlot.name)
    private slotModel: Model<AppointmentSlotDocument>,
    private readonly kafkaService: KafkaService,
    // private readonly webSocketService: WebSocketService,
  ) {}

  /**
   * JOB A: Handle immediate (today) conflicts
   * Runs immediately after doctor confirms update
   */
  @Process('handle-immediate-conflicts')
  async handleImmediateConflicts(
    job: Job<WorkingHoursUpdateJobData>,
  ): Promise<void> {
    const {
      conflictedBookingIds,
      newWorkingHours,
      inspectionDuration,
      inspectionPrice,
      doctorInfo,
    } = job.data;

    this.logger.log(
      `[Job A] Processing immediate conflicts for doctor ${doctorInfo.fullName}. Affected bookings: ${conflictedBookingIds.length}`,
    );

    try {
      // Step 1: Cancel conflicting bookings for today
      const cancelledBookings = await this.cancelBookings(
        conflictedBookingIds,
        'Doctor updated working hours',
      );

      this.logger.log(`[Job A] Cancelled ${cancelledBookings.length} bookings`);

      // Step 2: Free up the slots
      await this.freeUpSlots(cancelledBookings);

      // Delete and confirm
      // await this.DeleteTodaySlots(doctorInfo._id);
      this.logger.log(
        `[Job A] Today slots deleted, now publishing generation event`,
      );

      // Add small delay to ensure MongoDB write is visible across services
      await new Promise((resolve) => setTimeout(resolve, 2000));

      this.publishSlotGenerationTodayEvent(
        newWorkingHours,
        inspectionDuration,
        inspectionPrice,
        doctorInfo,
      );
      // Step 4: Send Kafka event to refresh doctor hours
      // this.publishDoctorHoursUpdatedEvent(doctorId, newWorkingHours);

      // Step 5: Send WebSocket notifications to affected patients
      // await this.notifyAffectedPatients(
      //   cancelledBookings,
      //   'today',
      //   'Your appointment today has been cancelled due to the doctor updating their schedule. Please book a new appointment.',
      // );

      this.logger.log(
        `[Job A] Completed successfully for doctor ${doctorInfo.fullName}`,
      );
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `[Job A] Failed for doctor ${doctorInfo.fullName}: ${err.message}`,
        err.stack,
      );
      throw error; // Bull will retry
    }
  }

  /**
   * JOB B: Handle future conflicts
   * Strategy: Run immediately but with lower priority
   * Rationale: Future bookings need timely notification, but can be processed
   * after immediate conflicts. Uses separate queue for better monitoring.
   */
  @Process('handle-future-conflicts')
  async handleFutureConflicts(
    job: Job<WorkingHoursUpdateJobData>,
  ): Promise<void> {
    const {
      conflictedBookingIds,
      newWorkingHours,
      inspectionDuration,
      inspectionPrice,
      doctorInfo,
    } = job.data;

    this.logger.log(
      `[Job B] Processing future conflicts for doctor ${doctorInfo.fullName}. Affected bookings: ${conflictedBookingIds.length}`,
    );

    try {
      // Step 1: Cancel future conflicting bookings
      const cancelledBookings = await this.cancelBookings(
        conflictedBookingIds,
        'Doctor updated working hours. This appointment time is no longer available.',
      );

      this.logger.log(
        `[Job B] Cancelled ${cancelledBookings.length} future bookings`,
      );

      // Step 2: Free up the slots
      await this.freeUpSlots(cancelledBookings);

      // Step 3: Delete future slots and regenerate
      await this.deleteFutureSlotsExcludingToday(doctorInfo._id);

      // await this.generateNewSlots(
      //   doctorId,
      //   newWorkingHours,
      //   inspectionDuration,
      //   inspectionPrice,
      //   doctorInfo,
      // );
      this.publishSlotGenerationFutureEvent(
        newWorkingHours,
        inspectionDuration,
        inspectionPrice,
        doctorInfo,
      );
      // Step 4: Send notifications to affected patients
      // await this.notifyAffectedPatients(
      //   cancelledBookings,
      //   'future',
      //   'Your upcoming appointment has been cancelled due to the doctor updating their schedule. Please book a new appointment at a convenient time.',
      // );

      // Step 5: Publish Kafka event for slot refresh
      // await this.publishSlotsRefreshedEvent(doctorId);

      this.logger.log(
        `[Job B] Completed successfully for doctor ${doctorInfo.fullName}`,
      );
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `[Job B] Failed for doctor ${doctorInfo.fullName}: ${err.message}`,
        err.stack,
      );
      throw error;
    }
  }

  /* -------------------------------------------------------------------------- */
  /*                           HELPER METHODS                                   */
  /* -------------------------------------------------------------------------- */

  /**
   * Cancel bookings and return details
   */
  private async cancelBookings(
    bookingIds: string[],
    cancellationReason: string,
  ): Promise<any[]> {
    const bookings = await this.appointmentModel
      .find({ _id: { $in: bookingIds } })
      .populate('patientId', 'username phone')
      .populate('slotId')
      .exec();

    // Update all to cancelled status
    await this.appointmentModel.updateMany(
      { _id: { $in: bookingIds } },
      {
        $set: {
          status: BookingStatus.CANCELLED_BY_DOCTOR,
          cancellationReason,
          cancelledAt: new Date(),
          cancelledBy: UserRole.DOCTOR,
        },
      },
    );

    return bookings;
  }

  /**
   * Free up slots that were occupied by cancelled bookings
   */
  private async freeUpSlots(cancelledBookings: any[]): Promise<void> {
    const slotIds = cancelledBookings.map((b) => b.slotId._id);

    await this.slotModel.updateMany(
      { _id: { $in: slotIds } },
      { $set: { status: SlotStatus.AVAILABLE } },
    );

    this.logger.debug(`Freed up ${slotIds.length} slots`);
  }

  /**
   * Regenerate slots for today only
   */
  private async DeleteTodaySlots(doctorId: string): Promise<void> {
    const today = getSyriaDate(); // 2026-02-17T21:00:00.000Z

    // Must match exactly what generateSlotsForDay stores:
    // slotDate.setUTCHours(0,0,0,0) on a getSyriaDate() value
    const slotDate = new Date(today);
    slotDate.setUTCHours(0, 0, 0, 0); // → 2026-02-17T00:00:00.000Z

    const result = await this.slotModel.deleteMany({
      doctorId,
      date: slotDate,
    });

    this.logger.debug(
      `Deleted ${result.deletedCount} today slots for doctor ${doctorId}`,
    );
  }

  //   // Generate new slots for today using your existing service
  //   const event = {
  //     eventType: 'SLOTS_GENERATE' as const,
  //     timestamp: new Date(),
  //     data: {
  //       doctorId,
  //       workingHours,
  //       inspectionDuration: duration,
  //       inspectionPrice: price,
  //       doctorInfo,
  //     },
  //     metadata: {
  //       source: 'working-hours-update',
  //       version: '1.0',
  //     },
  //   };

  //   // Call the slot generation directly for today only
  //   // We'll modify this to generate just today's slots
  //   await this.slotGenerationService.generateTodaySlots(event);

  //   this.logger.log(`Regenerated slots for today for doctor ${doctorId}`);
  // }

  /**
   * Generate new slots using existing service
   */
  // private async generateNewSlots(
  //   doctorId: string,
  //   workingHours: any[],
  //   duration: number,
  //   price: number | undefined,
  //   doctorInfo: any,
  // ): Promise<void> {
  //   const event = {
  //     eventType: 'SLOTS_GENERATE' as const,
  //     timestamp: new Date(),
  //     data: {
  //       doctorId,
  //       workingHours,
  //       inspectionDuration: duration,
  //       inspectionPrice: price,
  //       doctorInfo,
  //     },
  //     metadata: {
  //       source: 'working-hours-update',
  //       version: '1.0',
  //     },
  //   };

  //   await this.slotGenerationService.processSlotGeneration(event);
  // }

  /**
   * Send WebSocket notifications to affected patients
   */
  // private async notifyAffectedPatients(
  //   cancelledBookings: any[],
  //   type: 'today' | 'future',
  //   message: string,
  // ): Promise<void> {
  //   for (const booking of cancelledBookings) {
  //     const notification = {
  //       type: 'APPOINTMENT_CANCELLED',
  //       title: 'Appointment Cancelled',
  //       message,
  //       data: {
  //         bookingId: booking._id.toString(),
  //         appointmentDate: booking.appointmentDate,
  //         appointmentTime: booking.slotId.startTime,
  //         doctorName: booking.slotId.doctorInfo.fullName,
  //         reason: booking.cancellationReason,
  //       },
  //       timestamp: new Date(),
  //     };

  //     await this.webSocketService.sendNotificationToUser(
  //       booking.patientId._id.toString(),
  //       notification,
  //     );
  //   }

  //   this.logger.log(
  //     `Sent ${type} cancellation notifications to ${cancelledBookings.length} patients`,
  //   );
  // }

  /**
   * Publish Kafka event for doctor hours update
   */
  //  private publishDoctorHoursUpdatedEvent(
  //   doctorId: string,
  //   workingHours: any[],
  // ): void {
  //   const event = {
  //     eventType: 'DOCTOR_HOURS_UPDATED',
  //     timestamp: new Date(),
  //     data: {
  //       doctorId,
  //       workingHours,
  //     },
  //     metadata: {
  //       source: 'working-hours-update',
  //       version: '1.0',
  //     },
  //   };

  //   this.kafkaService.emit(KAFKA_TOPICS.DOCTOR_WORKING_HOURS_UPDATED, event);
  //   this.logger.debug(`Published doctor hours updated event for ${doctorId}`);
  // }

  /**
   * Publish Kafka event for slots refreshed
   */
  // private publishSlotsRefreshedEvent(doctorId: string): void {
  //   const event = {
  //     eventType: 'SLOTS_REFRESHED',
  //     timestamp: new Date(),
  //     data: {
  //       doctorId,
  //     },
  //     metadata: {
  //       source: 'working-hours-update',
  //       version: '1.0',
  //     },
  //   };

  //   this.kafkaService.emit(KAFKA_TOPICS.SLOTS_REFRESHED, event);
  //   this.logger.debug(`Published slots refreshed event for ${doctorId}`);
  // }

  // /**
  //  * Get Syria date (same as your slot generation service)
  //  */
  // private getSyriaDate(): Date {
  //   const now = new Date();
  //   const SYRIA_OFFSET_MINUTES = 3 * 60;
  //   const utcTime = now.getTime() + now.getTimezoneOffset() * 60 * 1000;
  //   const syriaTime = new Date(utcTime + SYRIA_OFFSET_MINUTES * 60 * 1000);
  //   syriaTime.setHours(0, 0, 0, 0);
  //   return syriaTime;
  // }

  private publishSlotGenerationTodayEvent(
    workingHours: any[],
    inspectionDuration: number,
    inspectionPrice: number | undefined,
    doctorInfo: any,
  ): void {
    const event: SlotGenerationTodayEvent = {
      eventType: 'SLOTS_GENERATE_FOR_TODAY',
      timestamp: new Date(),
      data: {
        doctorId: doctorInfo._id,
        workingHours: workingHours.map((wh) => ({
          day: wh.day,
          location: {
            type: wh.location.type,
            entity_name: wh.location.entity_name,
            address: wh.location.address,
          },
          startTime: wh.startTime,
          endTime: wh.endTime,
        })),
        inspectionDuration: inspectionDuration,
        inspectionPrice: inspectionPrice,
        doctorInfo: {
          fullName: `${doctorInfo.fullName}`,
        },
      },
      metadata: {
        source: 'doctor-service',
        version: '1.0',
      },
    };

    try {
      this.kafkaService.emit(KAFKA_TOPICS.SLOTS_GENERATE_FOR_TODAY, event);
      this.logger.log(
        `Slot generation event published for doctor ${doctorInfo.fullName}`,
      );
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `Failed to publish slot generation event: ${err.message}`,
        err.stack,
      );
    }
  }

  private publishSlotGenerationFutureEvent(
    workingHours: any[],
    inspectionDuration: number,
    inspectionPrice: number | undefined,
    doctorInfo: any,
  ): void {
    const event: SlotGenerationFutureEvent = {
      eventType: 'SLOTS_GENERATE_FOR_FUTURE',
      timestamp: new Date(),
      data: {
        doctorId: doctorInfo._id,
        workingHours: workingHours.map((wh) => ({
          day: wh.day,
          location: {
            type: wh.location.type,
            entity_name: wh.location.entity_name,
            address: wh.location.address,
          },
          startTime: wh.startTime,
          endTime: wh.endTime,
        })),
        inspectionDuration: inspectionDuration,
        inspectionPrice: inspectionPrice,
        doctorInfo: {
          fullName: `${doctorInfo.fullName}`,
        },
      },
      metadata: {
        source: 'doctor-service',
        version: '1.0',
      },
    };

    try {
      this.kafkaService.emit(KAFKA_TOPICS.SLOTS_GENERATE_FOR_FUTURE, event);
      this.logger.log(
        `Slot generation event future published for doctor ${doctorInfo.fullName}`,
      );
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `Failed to publish slot generation event: ${err.message}`,
        err.stack,
      );
    }
  }
  private async deleteFutureSlotsExcludingToday(
    doctorId: string,
  ): Promise<void> {
    const today = getSyriaDate();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const result = await this.slotModel.deleteMany({
      doctorId,
      date: { $gte: tomorrow }, // Only tomorrow and beyond
    });

    this.logger.debug(
      `[Job B] Deleted ${result.deletedCount} future slots (excluding today)`,
    );
  }
}
