import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Booking,
  BookingDocument,
} from '@app/common/database/schemas/booking.schema';
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
import { PauseSlotsJobData } from '../dto/slot-management.dto';
import { FcmService } from '../../fcm/fcm.service';

@Processor('pause-slots')
export class PauseSlotsProcessor {
  private readonly logger = new Logger(PauseSlotsProcessor.name);

  constructor(
    @InjectModel(Booking.name)
    private bookingModel: Model<BookingDocument>,
    @InjectModel(AppointmentSlot.name)
    private slotModel: Model<AppointmentSlotDocument>,
    private readonly kafkaService: KafkaService,
    private readonly fcmService: FcmService,
  ) {}

  /**
   * Pause slots and cancel affected bookings
   * Sends FCM notifications to affected patients
   */
  @Process('pause-slots-and-cancel-bookings')
  async handlePauseSlots(job: Job<PauseSlotsJobData>): Promise<void> {
    const {
      doctorId,
      slotIds,
      reason,
      pauseDate,
      affectedBookingIds,
      doctorInfo,
    } = job.data;

    this.logger.log(
      `[Pause Slots Job] Processing ${slotIds.length} slots for doctor ${doctorId}`,
    );

    try {
      // Step 1: Cancel affected bookings if any
      let cancelledBookings: any[] = [];
      if (affectedBookingIds.length > 0) {
        cancelledBookings = await this.cancelBookings(
          affectedBookingIds,
          reason,
        );
        this.logger.log(
          `[Pause Slots Job] Cancelled ${cancelledBookings.length} bookings`,
        );
      }

      // Step 2: Pause the slots
      await this.pauseSlots(slotIds);

      // Step 3: Send FCM notifications to affected patients
      if (cancelledBookings.length > 0) {
        await this.sendFCMNotifications(
          cancelledBookings,
          doctorInfo.fullName,
          reason,
        );
      }

      // Step 4: Publish Kafka event for slots refreshed
      this.publishSlotsRefreshedEvent(doctorId, slotIds);

      this.logger.log(
        `[Pause Slots Job] Completed successfully for doctor ${doctorId}`,
      );
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `[Pause Slots Job] Failed for doctor ${doctorId}: ${err.message}`,
        err.stack,
      );
      throw error; // Bull will retry
    }
  }

  /**
   * Cancel bookings
   */
  private async cancelBookings(
    bookingIds: string[],
    reason: string,
  ): Promise<any[]> {
    const bookings = await this.bookingModel
      .find({ _id: { $in: bookingIds } })
      .populate('patientId', 'username phone fcmToken')
      .populate('slotId')
      .exec();

    // Update all to cancelled
    await this.bookingModel.updateMany(
      { _id: { $in: bookingIds } },
      {
        $set: {
          status: BookingStatus.CANCELLED_BY_DOCTOR,
          cancellation: {
            cancelledBy: UserRole.DOCTOR,
            reason: `Doctor paused slot: ${reason}`,
            cancelledAt: new Date(),
          },
        },
      },
    );

    this.logger.log(`Cancelled ${bookings.length} bookings`);

    return bookings;
  }

  /**
   * Pause slots (mark as PAUSED for today only)
   */
  private async pauseSlots(slotIds: string[]): Promise<void> {
    // Update slots to PAUSED status
    const result = await this.slotModel.updateMany(
      {
        _id: { $in: slotIds.map((id) => new Types.ObjectId(id)) },
        // Only pause for the specific date
      },
      {
        $set: {
          status: SlotStatus.BLOCKED,
          pausedAt: new Date(),
        },
      },
    );

    this.logger.log(`Paused ${result.modifiedCount} slots`);
  }

  /**
   * Send FCM notifications to all affected patients
   */
  private async sendFCMNotifications(
    cancelledBookings: any[],
    doctorName: string,
    reason: string,
  ): Promise<void> {
    const notifications = cancelledBookings
      .map((booking) => {
        const patient = booking.patientId;

        if (!patient) {
          this.logger.warn(`Booking ${booking._id} has no patient`);
          return null;
        }

        const fcmToken = patient.fcmToken;

        if (!fcmToken) {
          this.logger.warn(
            `Patient ${patient._id} has no FCM token. Skipping notification.`,
          );
          return null;
        }

        return {
          fcmToken,
          data: {
            bookingId: booking._id.toString(),
            doctorName,
            appointmentDate: this.formatDate(booking.bookingDate),
            appointmentTime: booking.bookingTime,
            reason,
            type: 'SLOT_PAUSED' as const,
          },
        };
      })
      .filter(Boolean);

    // Send FCM notifications
    for (const notification of notifications) {
      if (!notification) continue;

      try {
        const sent = await this.fcmService.sendBookingCancellationNotification(
          notification.fcmToken,
          notification.data,
        );

        if (sent) {
          this.logger.log(
            `FCM notification sent for booking ${notification.data.bookingId}`,
          );
        } else {
          this.logger.warn(
            `Failed to send FCM notification for booking ${notification.data.bookingId}`,
          );
        }
      } catch (error) {
        this.logger.error(
          `Error sending FCM notification: ${error.message}`,
          error.stack,
        );
      }
    }

    this.logger.log(
      `Sent FCM notifications to ${notifications.length} patients`,
    );
  }

  /**
   * Publish Kafka event for slots refreshed
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
        action: 'SLOTS_PAUSED',
      },
      metadata: {
        source: 'pause-slots-service',
        version: '1.0',
      },
    };

    try {
      this.kafkaService.emit(KAFKA_TOPICS.SLOTS_REFRESHED, event);
      this.logger.log(`Slots refreshed event published for doctor ${doctorId}`);
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `Failed to publish slots refreshed event: ${err.message}`,
        err.stack,
      );
    }
  }

  /**
   * Format date for display
   */
  private formatDate(date: Date): string {
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(new Date(date));
  }
}
