import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import { DateTime } from 'luxon';
import {
  AppointmentSlot,
  AppointmentSlotDocument,
} from '@app/common/database/schemas/slot.schema';
import {
  BookingStatus,
  Days,
  SlotStatus,
  WorkigEntity,
} from '@app/common/database/schemas/common.enums';
import {
  Booking,
  BookingDocument,
} from '@app/common/database/schemas/booking.schema';
import { FcmService } from 'apps/home-service/src/fcm/fcm.service';
import { User, UserDocument } from '@app/common/database/schemas/user.schema';
import { Doctor } from '@app/common/database/schemas/doctor.schema';
import { KafkaService } from '@app/common/kafka/kafka.service';
import { KAFKA_TOPICS } from '@app/common/kafka/events/topics';
import { formatDate } from '@app/common/utils/get-syria-date';

export interface WorkingHoursUpdateJobData {
  doctorId: string;
  oldWorkingHours: Array<{
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
  inspectionPrice: number;
  newWorkingHours: Array<{
    day: Days;
    location: {
      type: WorkigEntity;
      entity_name: string;
      address: string;
    };
    startTime: string;
    endTime: string;
  }>;
  version: number;
  updatedDays: Array<Days>;
}

export interface WorkingHourRange {
  day: Days;
  location: {
    type: WorkigEntity;
    entity_name: string;
    address: string;
  };
  startTime: string;
  endTime: string;
}

@Processor('WORKING_HOURS_UPDATE')
export class WorkingHoursUpdateProcessorV2 {
  private readonly logger = new Logger(WorkingHoursUpdateProcessorV2.name);

  constructor(
    @InjectModel(AppointmentSlot.name)
    private slotModel: Model<AppointmentSlotDocument>,
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(Booking.name) private bookingModel: Model<BookingDocument>,
    private readonly fcmService: FcmService,
    private kafkaProducer: KafkaService,
  ) {}

  /**
   * JOB A: Handle immediate (today) conflicts
   * Runs immediately after doctor confirms update
   */

  @Process('PROCESS_WORKING_HOURS_UPDATE')
  async processWorkingHoursUpdate(
    job: Job<WorkingHoursUpdateJobData>,
  ): Promise<void> {
    const {
      doctorId,
      oldWorkingHours,
      newWorkingHours,
      inspectionDuration,
      inspectionPrice,
      version,
      updatedDays,
    } = job.data;

    const doctorObjectId = new Types.ObjectId(doctorId);

    this.logger.log(`begining of PROCESS_WORKING_HOURS_UPDATE`);

    for (const day of updatedDays) {
      await this.processSingleDay(
        doctorObjectId,
        day,
        oldWorkingHours,
        newWorkingHours,
        version,
        inspectionDuration,
        inspectionPrice,
      );
    }
  }

  private async processSingleDay(
    doctorId: Types.ObjectId,
    day: Days,
    oldWH: WorkingHourRange[],
    newWH: WorkingHourRange[],
    version: number,
    duration: number,
    price: number,
  ) {
    const session = await this.connection.startSession();
    session.startTransaction();

    const affectedBookings: Array<{
      bookingId: string;
      doctorId: string;
      fcmToken: string;
      patientId: string;
      doctorName: string;
      appointmentDate: Date;
      appointmentTime: string;
    }> = [];

    try {
      const futureDates = this.getNext12WeeksDatesForDay(day);
      const validRanges = newWH.filter((w) => w.day === day);

      for (const date of futureDates) {
        const startOfDay = new Date(date);
        const endOfDay = new Date(date.getTime() + 24 * 60 * 60 * 1000 - 1);

        const oldSlots = await this.slotModel
          .find({
            doctorId: doctorId,
            date: { $gte: startOfDay, $lte: endOfDay },
            status: { $ne: SlotStatus.INVALIDATED },
          })
          .session(session);

        this.logger.log(
          `Found ${oldSlots.length} slots for ${day} on ${date.toISOString()}`,
        );

        for (const slot of oldSlots) {
          if (!this.slotFitsRanges(slot, validRanges)) {
            if (slot.status === SlotStatus.BOOKED) {
              const booking = await this.bookingModel
                .findOne({ slotId: slot._id })
                .populate<{ patientId: User }>('patientId', 'fcmToken')
                .populate<{
                  doctorId: Doctor;
                }>('doctorId', 'firstName lastName')
                .session(session)
                .exec();

              // ✅ FIXED: Type assertion after populate
              if (booking && typeof booking.patientId !== 'string') {
                const patient = booking.patientId as unknown as User;
                const doctor = booking.doctorId as unknown as Doctor;

                if (patient?.fcmToken) {
                  affectedBookings.push({
                    bookingId: booking._id.toString(),
                    patientId: patient._id.toString(),
                    doctorId: doctor._id.toString(),
                    fcmToken: patient.fcmToken,
                    doctorName: `${doctor.firstName} ${doctor.lastName}`,
                    appointmentDate: booking.bookingDate,
                    appointmentTime: booking.bookingTime,
                  });
                }
              }

              await this.bookingModel.updateOne(
                { slotId: slot._id },
                {
                  status: BookingStatus.NEEDS_RESCHEDULE,
                  cancellation: {
                    cancelledBy: 'SYSTEM',
                    reason: 'Doctor updated working hours',
                    cancelledAt: new Date(),
                  },
                },
                { session },
              );
            }

            slot.status = SlotStatus.INVALIDATED;
            await slot.save({ session });
          }
        }

        await this.generateNewSlotsForDate(
          doctorId,
          date,
          validRanges,
          version,
          duration,
          price,
          session,
        );
      }

      await session.commitTransaction();

      // Send notifications AFTER successful commit
      if (affectedBookings.length > 0) {
        await this.sendPersonalizedNotifications(affectedBookings).catch(
          (err) => this.logger.error('Notification error:', err),
        );
      }
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      await session.endSession();
    }
  }

  private async generateNewSlotsForDate(
    doctorId: Types.ObjectId,
    date: Date,
    ranges: WorkingHourRange[],
    version: number,
    duration: number,
    price: number,
    session: ClientSession,
  ) {
    const startOfDay = new Date(date);
    const endOfDay = new Date(date.getTime() + 24 * 60 * 60 * 1000 - 1);
    for (const range of ranges) {
      const generatedSlots = this.buildSlotsFromRange(
        doctorId,
        date,
        range.startTime,
        range.endTime,
        range.day,
        range.location,
        duration,
        version,
        price,
      );

      for (const slot of generatedSlots) {
        const exists = await this.slotModel
          .findOne({
            doctorId: doctorId,
            date: { $gte: startOfDay, $lte: endOfDay },
            startTime: slot.startTime,
            status: { $ne: SlotStatus.INVALIDATED },
          })
          .session(session);

        if (!exists) {
          await this.slotModel.insertMany(slot, { session });
        }
      }
    }
  }

  private getNext12WeeksDatesForDay(day: Days): Date[] {
    const dayMap: Record<Days, number> = {
      [Days.SUNDAY]: 7,
      [Days.MONDAY]: 1,
      [Days.TUESDAY]: 2,
      [Days.WEDNESDAY]: 3,
      [Days.THURSDAY]: 4,
      [Days.FRIDAY]: 5,
      [Days.SATURDAY]: 6,
    };

    const target = dayMap[day];
    let dt = DateTime.now().setZone('Asia/Damascus').startOf('day');

    while (dt.weekday !== target) {
      dt = dt.plus({ days: 1 });
    }

    const dates: Date[] = [];
    for (let i = 0; i < 12; i++) {
      const d = dt.plus({ weeks: i });
      // ✅ Saturday Syria = 2026-02-21T00:00:00.000Z correct
      dates.push(new Date(Date.UTC(d.year, d.month - 1, d.day, 0, 0, 0, 0)));
    }

    return dates;
  }
  private slotFitsRanges(
    slot: AppointmentSlotDocument,
    ranges: WorkingHourRange[],
  ): boolean {
    const slotStart = this.timeToMinutes(slot.startTime);
    const slotEnd = this.timeToMinutes(slot.endTime);

    for (const range of ranges) {
      const rangeStart = this.timeToMinutes(range.startTime);
      const rangeEnd = this.timeToMinutes(range.endTime);

      if (slotStart >= rangeStart && slotEnd <= rangeEnd) {
        return true;
      }
    }

    return false;
  }

  private timeToMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }

  private minutesToTime(minutes: number): string {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;

    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  }
  private buildSlotsFromRange(
    doctorId: Types.ObjectId,
    date: Date,
    startTime: string,
    endTime: string,
    dayOfWeek: Days,
    location: {
      type: WorkigEntity;
      entity_name: string;
      address: string;
    },
    duration: number,
    price: number,
    version: number,
  ): Partial<AppointmentSlotDocument>[] {
    const slots: Partial<AppointmentSlotDocument>[] = [];

    let startMinutes = this.timeToMinutes(startTime);
    const endMinutes = this.timeToMinutes(endTime);

    while (startMinutes + duration <= endMinutes) {
      const slotStart = this.minutesToTime(startMinutes);
      const slotEnd = this.minutesToTime(startMinutes + duration);
      // const today = getSyriaDate();
      // const slotDate = new Date(today);
      const slotDate = new Date(date);

      slots.push({
        doctorId,
        date: slotDate,
        startTime: slotStart,
        endTime: slotEnd,
        status: SlotStatus.AVAILABLE,
        workingHoursVersion: version,
        duration: duration,
        price: price,
        dayOfWeek: dayOfWeek,
        location: location,
      });

      startMinutes += duration;
    }

    return slots;
  }

  // async sendPersonalizedNotifications(
  //   affectedBookings: Array<{
  //     bookingId: string;
  //     fcmToken: string;
  //     doctorName: string;
  //     appointmentDate: Date;
  //     appointmentTime: string;
  //   }>,
  // ): Promise<void> {
  //   this.logger.log(
  //     `📱 Sending personalized FCM to ${affectedBookings.length} patients`,
  //   );

  //   let successCount = 0;
  //   let failureCount = 0;
  //   const invalidTokens: string[] = [];

  //   // Process in parallel batches of 10 to avoid overwhelming Firebase
  //   const PARALLEL_LIMIT = 10;

  //   for (let i = 0; i < affectedBookings.length; i += PARALLEL_LIMIT) {
  //     const batch = affectedBookings.slice(i, i + PARALLEL_LIMIT);

  //     const promises = batch.map(async (booking) => {
  //       try {
  //         const sent =
  //           await this.fcmService.sendBookingCancellationNotification(
  //             booking.fcmToken,
  //             {
  //               bookingId: booking.bookingId,
  //               doctorName: booking.doctorName,
  //               appointmentDate: this.formatDate(booking.appointmentDate),
  //               appointmentTime: booking.appointmentTime,
  //               reason: 'Doctor updated working hours. Please reschedule.',
  //               type: 'DOCTOR_CANCELLED',
  //             },
  //           );

  //         return { success: sent, token: booking.fcmToken };
  //       } catch (error) {
  //         const err = error as Error;
  //         this.logger.error(
  //           `Failed to send notification for booking ${booking.bookingId}: ${err.message}`,
  //         );
  //         return { success: false, token: booking.fcmToken };
  //       }
  //     });

  //     const results = await Promise.all(promises);

  //     results.forEach((result) => {
  //       if (result.success) {
  //         successCount++;
  //       } else {
  //         failureCount++;
  //         invalidTokens.push(result.token);
  //       }
  //     });

  //     this.logger.debug(
  //       `Progress: ${i + batch.length}/${affectedBookings.length} processed`,
  //     );
  //   }

  //   this.logger.log(
  //     `✅ Personalized notifications: ${successCount} success, ${failureCount} failed`,
  //   );

  //   // Clean up invalid tokens
  //   if (invalidTokens.length > 0) {
  //     this.logger.warn(`Found ${invalidTokens.length} invalid tokens`);
  //     // You can call removeInvalidTokens here if needed
  //   }
  // }

  async sendPersonalizedNotifications(
    affectedBookings: Array<{
      bookingId: string;
      doctorId: string;
      patientId: string;
      fcmToken: string;
      doctorName: string;
      appointmentDate: Date;
      appointmentTime: string;
    }>,
  ): Promise<void> {
    this.logger.log(
      `📱 Sending personalized FCM to ${affectedBookings.length} patients`,
    );

    let successCount = 0;
    let failureCount = 0;
    const invalidTokens: string[] = [];

    // Process in parallel batches of 10 to avoid overwhelming Firebase
    const PARALLEL_LIMIT = 10;

    for (let i = 0; i < affectedBookings.length; i += PARALLEL_LIMIT) {
      const batch = affectedBookings.slice(i, i + PARALLEL_LIMIT);

      const promises = batch.map(async (booking) => {
        try {
          const sent = await this.sendDisplacementNotification({
            patientId: booking.patientId,
            fcmToken: booking.fcmToken,
            bookingId: booking.bookingId,
            doctorId: booking.doctorId,
            doctorName: booking.doctorName,
            appointmentDate: booking.appointmentDate,
            appointmentTime: booking.appointmentTime,
            reason: 'Doctor updated working hours. Please reschedule.',
          });

          return { success: sent, token: booking.fcmToken };
        } catch (error) {
          const err = error as Error;
          this.logger.error(
            `Failed to send notification for booking ${booking.bookingId}: ${err.message}`,
          );
          return { success: false, token: booking.fcmToken };
        }
      });

      const results = await Promise.all(promises);

      results.forEach((result) => {
        if (result.success) {
          successCount++;
        } else {
          failureCount++;
          invalidTokens.push(result.token);
        }
      });

      this.logger.debug(
        `Progress: ${i + batch.length}/${affectedBookings.length} processed`,
      );
    }

    this.logger.log(
      `✅ Personalized notifications: ${successCount} success, ${failureCount} failed`,
    );

    // Clean up invalid tokens
    if (invalidTokens.length > 0) {
      this.logger.warn(`Found ${invalidTokens.length} invalid tokens`);
      // You can call removeInvalidTokens here if needed
    }
  }

  private async sendDisplacementNotification(data: {
    patientId: string;
    fcmToken: string;
    bookingId: string;
    doctorId: string;
    doctorName: string;
    appointmentDate: Date;
    appointmentTime: string;
    reason: string;
  }): Promise<boolean> {
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
      await this.kafkaProducer.emit(
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
