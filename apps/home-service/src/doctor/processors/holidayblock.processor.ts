import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  Booking,
  BookingDocument,
} from '@app/common/database/schemas/booking.schema';
import {
  AppointmentSlot,
  AppointmentSlotDocument,
} from '@app/common/database/schemas/slot.schema';
import { User } from '@app/common/database/schemas/user.schema';
import {
  BookingStatus,
  SlotStatus,
  UserRole,
} from '@app/common/database/schemas/common.enums';
import { KafkaService } from '@app/common/kafka/kafka.service';
import { KAFKA_TOPICS } from '@app/common/kafka/events/topics';
import { HolidayBlockJobData } from '../dto/vibbooking.dto';
import { formatDate } from '@app/common/utils/get-syria-date';
import { invalidateBookingCaches } from '@app/common/utils/cache-invalidation.util';
import { CacheService } from '@app/common/cache/cache.service';

export interface PopulatedBookingDocument extends Omit<
  BookingDocument,
  'patientId'
> {
  patientId: User;
}

@Processor({ name: 'holiday-block' })
export class HolidayBlockProcessor {
  private readonly logger = new Logger(HolidayBlockProcessor.name);

  constructor(
    @InjectModel(Booking.name)
    private bookingModel: Model<BookingDocument>,
    @InjectModel(AppointmentSlot.name)
    private slotModel: Model<AppointmentSlotDocument>,
    private readonly kafkaService: KafkaService,
    private readonly cacheManager: CacheService,
  ) {
    this.logger.log(`[Holiday Block Job] Processing for doctor`);
  }

  /**
   * Process holiday blocking
   * Cancels bookings and blocks slots, sends PERSONALIZED notifications
   */
  @Process('block-holiday-dates')
  async handleHolidayBlock(job: Job<HolidayBlockJobData>): Promise<void> {
    const {
      doctorId,
      doctorName,
      reason,
      affectedBookingIds,
      affectedSlotIds,
    } = job.data;

    const session = await this.bookingModel.db.startSession();
    session.startTransaction();
    try {
      // Step 1: Get all affected bookings with patient details
      const bookings = (await this.bookingModel
        .find({ _id: { $in: affectedBookingIds } })
        .populate<{ patientId: User }>('patientId', 'username phone fcmToken')
        .session(session)
        .exec()) as PopulatedBookingDocument[];

      // Step 2: Cancel all pending bookings
      await this.bookingModel.updateMany(
        { _id: { $in: affectedBookingIds } },
        {
          $set: {
            status: BookingStatus.CANCELLED_BY_DOCTOR,
            cancellation: {
              cancelledBy: UserRole.DOCTOR,
              reason: `${reason}`,
              cancelledAt: new Date(),
            },
          },
        },
        { session },
      );

      this.logger.log(
        `[Holiday Block Job] Cancelled ${bookings.length} bookings`,
      );

      // Step 3: Block all slots in the date range
      await this.slotModel.updateMany(
        { _id: { $in: affectedSlotIds } },
        {
          $set: {
            status: SlotStatus.BLOCKED,
            blockReason: reason,
            blockedAt: new Date(),
          },
        },
        { session },
      );

      this.logger.log(
        `[Holiday Block Job] Blocked ${affectedSlotIds.length} slots`,
      );

      // Commit transaction
      await session.commitTransaction();

      this.logger.log(`[Holiday Block Job] ✅ Transaction committed`);

      // Step 4: Send PERSONALIZED FCM notifications
      this.sendPersonalizedNotifications(
        bookings,
        doctorName,
        doctorId,
        reason,
      );

      // Step 5: Publish Kafka event to refresh slots
      this.publishSlotsRefreshedEvent(doctorId, affectedSlotIds);
      const affectedPatientIds = [
        ...new Set(
          bookings
            .map((b) => (b.patientId as any)?._id?.toString())
            .filter(Boolean),
        ),
      ];

      await invalidateBookingCaches(
        this.cacheManager,
        doctorId,
        affectedPatientIds,
        this.logger,
      );
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `Failed to publish slots refreshed event: ${err.message}`,
      );
      await session.abortTransaction();
      this.logger.error(
        `[Holiday Block Job] ❌ Failed: ${err.message}`,
        err.stack,
      );
      throw error;
    } finally {
      await session.endSession();
    }
  }

  /**
   * Send PERSONALIZED FCM notifications to each affected patient
   * Each patient gets their specific appointment time in the notification
   */
  private sendPersonalizedNotifications(
    bookings: PopulatedBookingDocument[],
    doctorName: string,
    doctorId: string,
    reason: string,
  ): void {
    this.logger.log(
      `[Holiday Block Job] 📱 Sending personalized notifications to ${bookings.length} patients`,
    );

    let successCount = 0;
    let failureCount = 0;
    const invalidTokens: string[] = [];

    // Process in parallel batches of 10
    const PARALLEL_LIMIT = 10;

    for (let i = 0; i < bookings.length; i += PARALLEL_LIMIT) {
      const batch = bookings.slice(i, i + PARALLEL_LIMIT);

      const promises = batch.map((booking) => {
        const patient = booking.patientId; // patientId is now typed as User due to PopulatedBookingDocument

        if (!patient?.fcmToken) {
          this.logger.warn(
            `Patient ${patient?._id.toString() || 'unknown'} has no FCM token`,
          );
          return { success: false, token: null }; // Ensure token is explicitly null
        }

        try {
          // const sent =
          //   await this.fcmService.sendBookingCancellationNotification(
          //     patient.fcmToken,
          //     {
          //       bookingId: booking._id!.toString(), // _id is guaranteed to exist after population
          //       doctorName,
          //       appointmentDate: this.formatDate(booking.bookingDate),
          //       appointmentTime: booking.bookingTime,
          //       reason: `Doctor on holiday: ${reason}`,
          //       type: 'DOCTOR_CANCELLED',
          //     },
          //   );
          //
          const sent = this.sendDisplacementNotification({
            patientId: patient._id.toString(),
            fcmToken: patient.fcmToken,
            bookingId: booking._id!.toString(),
            doctorId,
            doctorName,
            appointmentDate: booking.bookingDate,
            appointmentTime: booking.bookingTime,
            reason,
          });

          return { success: sent, token: patient.fcmToken }; // Ensure token is always returned
        } catch (error) {
          const err = error as Error;
          this.logger.error(
            `Failed to send notification for booking ${booking._id!.toString()}: ${err.message}`,
          ); // _id is guaranteed to exist
          return { success: false, token: patient.fcmToken }; // Ensure token is always returned
        }
      });

      const results = promises;

      results.forEach((result) => {
        if (result.success) {
          successCount++;
        } else {
          failureCount++;
          // Only push to invalidTokens if `result.token` is a string (not null or undefined)
          if (result.token) {
            invalidTokens.push(result.token);
          }
        }
      });

      this.logger.debug(
        `[Holiday Block Job] Progress: ${i + batch.length}/${bookings.length} notifications processed`,
      );
    }

    this.logger.log(
      `[Holiday Block Job] ✅ Personalized notifications: ${successCount} sent, ${failureCount} failed`,
    );

    // Clean up invalid tokens
    if (invalidTokens.length > 0) {
      this.logger.warn(
        `[Holiday Block Job] Found ${invalidTokens.length} invalid tokens`,
      );
      // Optionally remove invalid tokens from database
    }
  }

  /**
   * Publish slots refreshed event
   */
  private publishSlotsRefreshedEvent(
    doctorId: string,
    slotIds: string[],
  ): void {
    const event = {
      eventType: 'SLOTS_REFRESHED',
      timestamp: new Date(),
      data: {
        doctorId,
        slotIds,
        action: 'HOLIDAY_BLOCKED',
      },
      metadata: {
        source: 'holiday-block-service',
        version: '1.0',
      },
    };

    try {
      this.kafkaService.emit(KAFKA_TOPICS.SLOTS_REFRESHED, event);
      this.logger.log(
        `[Holiday Block Job] Slots refreshed event published for doctor ${doctorId}`,
      );
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `Failed to publish slots refreshed event: ${err.message}`,
      );
    }
  }

  private sendDisplacementNotification(data: {
    patientId: string;
    fcmToken: string;
    bookingId: string;
    doctorId: string;
    doctorName: string;
    appointmentDate: Date;
    appointmentTime: string;
    reason: string;
  }): boolean {
    if (!data.fcmToken) {
      this.logger.warn(
        `Patient ${data.patientId} has no FCM token. Notification not sent.`,
      );
      return false;
    }

    const event = {
      eventType: 'BOOKING_CANCELLED_NOTIFICATION',
      timestamp: new Date(),
      data: {
        patientId: data.patientId,
        doctorId: data.doctorId,
        doctorName: data.doctorName,
        fcmToken: data.fcmToken,
        bookingId: data.bookingId,
        appointmentDate: formatDate(data.appointmentDate),
        appointmentTime: data.appointmentTime,
        reason: data.reason,
        type: 'DOCTOR_CANCELLED',
      },
      metadata: {
        source: 'notification-service',
        version: '1.0',
      },
    };

    try {
      this.kafkaService.emit(
        KAFKA_TOPICS.BOOKING_CANCELLED_NOTIFICATION,
        event,
      );
      this.logger.log(
        `📱 Notification event published for patient ${data.patientId}`,
      );
      return true;
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `Failed to send displacement notification: ${err.message}`,
      );
      return false;
    }
  }
}
