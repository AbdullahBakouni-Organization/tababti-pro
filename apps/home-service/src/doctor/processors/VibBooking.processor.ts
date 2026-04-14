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
import { User, UserDocument } from '@app/common/database/schemas/user.schema';
import {
  BookingStatus,
  SlotStatus,
  UserRole,
} from '@app/common/database/schemas/common.enums';
import { KafkaService } from '@app/common/kafka/kafka.service';
import { KAFKA_TOPICS } from '@app/common/kafka/events/topics';
import { VIPBookingJobData } from '../dto/vibbooking.dto';
import { CacheService } from '@app/common/cache/cache.service';
import { invalidateBookingCaches } from '@app/common/utils/cache-invalidation.util';

@Processor('vip-booking')
export class VIPBookingProcessor {
  private readonly logger = new Logger(VIPBookingProcessor.name);

  constructor(
    @InjectModel(Booking.name)
    private bookingModel: Model<BookingDocument>,
    @InjectModel(AppointmentSlot.name)
    private slotModel: Model<AppointmentSlotDocument>,
    @InjectModel(User.name)
    private userModel: Model<UserDocument>,
    private readonly kafkaService: KafkaService,
    private readonly cacheManager: CacheService,
  ) {
    this.logger.log(`[VIP Booking Job] Processing for doctor`);
  }

  /**
   * Process VIP booking creation
   * Handles displacement of existing booking if necessary
   */
  @Process('create-vip-booking')
  async handleVIPBooking(job: Job<VIPBookingJobData>): Promise<void> {
    const {
      doctorId,
      doctorName,
      slotId,
      vipPatientId,
      patientName,
      patientAddress,
      patientPhone,
      existingBookingId,
      reason,
      note,
    } = job.data;

    const isManualPatient = !vipPatientId;

    this.logger.log(
      `[VIP Booking Job] Processing for slot ${slotId}, ${
        isManualPatient
          ? `manual patient: ${patientName}`
          : `VIP patient: ${vipPatientId}`
      }`,
    );

    const session = await this.bookingModel.db.startSession();
    session.startTransaction();

    try {
      let displacedPatient: UserDocument | null = null;
      let displacedBooking: any = null;

      // Step 1: If slot is already booked, cancel existing booking
      if (existingBookingId) {
        displacedBooking = await this.bookingModel
          .findById(existingBookingId)
          .populate('patientId', 'username phone fcmToken')
          .session(session)
          .exec();

        if (
          displacedBooking?.patientId &&
          typeof displacedBooking.patientId !== 'string'
        ) {
          displacedPatient = displacedBooking.patientId as UserDocument;

          displacedBooking.status = BookingStatus.CANCELLED_BY_DOCTOR;
          displacedBooking.cancellation = {
            cancelledBy: UserRole.DOCTOR,
            reason: `VIP booking override: ${reason}`,
            cancelledAt: new Date(),
          };

          await displacedBooking.save({ session });
        }
      }

      // Step 2: Get slot; for DB patients also verify the patient record exists.
      const slot = await this.slotModel
        .findById(slotId)
        .session(session)
        .exec();

      if (!slot) {
        throw new Error(`Slot ${slotId} not found`);
      }

      let vipPatient: UserDocument | null = null;
      if (!isManualPatient) {
        vipPatient = await this.userModel
          .findById(vipPatientId)
          .session(session)
          .exec();

        if (!vipPatient) {
          throw new Error(`VIP patient ${vipPatientId} not found`);
        }
      }

      // Step 3: Create VIP booking
      const bookingFields = isManualPatient
        ? {
            patientId: null,
            patientName,
            patientAddress,
            patientPhone,
          }
        : {
            patientId: new Types.ObjectId(vipPatientId),
          };

      const vipBooking = await this.bookingModel.create(
        [
          {
            ...bookingFields,
            doctorId: new Types.ObjectId(doctorId),
            slotId: new Types.ObjectId(slotId),
            status: BookingStatus.PENDING,
            bookingDate: slot.date,
            bookingTime: slot.startTime,
            bookingEndTime: slot.endTime,
            location: slot.location,
            price: slot.price,
            createdBy: UserRole.DOCTOR,
            note: note || 'VIP booking',
          },
        ],
        { session },
      );

      // Step 4: Mark slot as BOOKED
      slot.status = SlotStatus.BOOKED;
      await slot.save({ session });

      // Commit transaction
      await session.commitTransaction();

      this.logger.log(
        `[VIP Booking Job] ✅ VIP booking created: ${vipBooking[0]._id.toString()}`,
      );

      // Step 5: Send notification to displaced patient (if any)
      if (displacedPatient && displacedBooking) {
        this.sendDisplacementNotification(
          displacedPatient,
          displacedBooking,
          doctorId,
          doctorName,
          reason,
        );
      }

      // Step 6: Publish Kafka event to refresh slots
      this.publishSlotsRefreshedEvent(doctorId, slotId);

      // Cache invalidation: only invalidate by patientId for real DB patients;
      // manual patients have no user-level cache.
      const affectedPatientIds = [
        displacedPatient?._id?.toString(),
        ...(vipPatientId ? [vipPatientId] : []),
      ].filter(Boolean) as string[];

      await invalidateBookingCaches(
        this.cacheManager,
        doctorId,
        affectedPatientIds,
        this.logger,
      );
    } catch (error) {
      const err = error as Error;
      await session.abortTransaction();
      this.logger.error(
        `[VIP Booking Job] ❌ Failed: ${err.message}`,
        err.stack,
      );
      throw error;
    } finally {
      await session.endSession();
    }
  }

  /**
   * Send notification to displaced patient
   */
  private sendDisplacementNotification(
    patient: UserDocument,
    booking: BookingDocument,
    doctorId: string,
    doctorName: string,
    reason: string,
  ): void {
    if (!patient.fcmToken) {
      this.logger.warn(
        `Patient ${patient._id.toString()} has no FCM token. Notification not sent.`,
      );
      return;
    }

    const event = {
      eventType: 'BOOKING_CANCELLED_NOTIFICATION',
      timestamp: new Date(),
      data: {
        patientId: patient._id.toString(),
        patientName: `${patient.username}`,
        doctorId,
        doctorName,
        fcmToken: patient.fcmToken,
        bookingId: booking._id!.toString(),
        appointmentDate: booking.bookingDate,
        appointmentTime: booking.bookingTime,
        reason: reason,
        type: 'DOCTOR_CANCELLED',
      },
      metadata: {
        source: 'vip-booking-service',
        version: '1.0',
      },
    };

    try {
      this.kafkaService.emit(
        KAFKA_TOPICS.BOOKING_CANCELLED_NOTIFICATION,
        event,
      );
      this.logger.log(
        `[VIP Booking Job] 📱 Notification sent to displaced patient ${patient._id.toString()}`,
      );
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `Failed to send displacement notification: ${err.message}`,
      );
    }
  }

  /**
   * Publish slots refreshed event
   */
  private publishSlotsRefreshedEvent(doctorId: string, slotId: string): void {
    const event = {
      eventType: 'SLOTS_REFRESHED',
      timestamp: new Date(),
      data: {
        doctorId,
        slotIds: [slotId],
        action: 'VIP_BOOKING_CREATED',
      },
      metadata: {
        source: 'vip-booking-service',
        version: '1.0',
      },
    };

    try {
      this.kafkaService.emit(KAFKA_TOPICS.SLOTS_REFRESHED, event);
      this.logger.log(`[VIP Booking Job] Slots refreshed event published`);
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `Failed to publish slots refreshed event: ${err.message}`,
      );
    }
  }
}
