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
    @InjectModel(User.name) private userModel: Model<UserDocument>,
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
  ) {
    const session = await this.connection.startSession();
    session.startTransaction();
    const affectedBookings: Array<{
      bookingId: string;
      fcmToken: string;
      appointmentDate: Date;
      appointmentTime: string;
    }> = [];
    try {
      const futureDates = this.getNext12WeeksDatesForDay(day);

      const validRanges = newWH.filter((w) => w.day === day);
      for (const date of futureDates) {
        const startOfDay = new Date(date); // 2026-02-19T21:00:00.000Z ✅
        const endOfDay = new Date(date.getTime() + 24 * 60 * 60 * 1000 - 1); // +24h - 1ms ✅

        const oldSlots = await this.slotModel
          .find({
            doctorId: doctorId,
            date: { $gte: startOfDay, $lte: endOfDay }, // ✅ range, not exact
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
                .populate('patientId', 'fcmToken')
                .populate('doctorId', 'firstName lastName')
                .session(session);

              // ✅ ADD THIS: Collect for batch notification
              if (booking?.patientId?.fcmToken) {
                affectedBookings.push({
                  bookingId: booking._id.toString(),
                  fcmToken: booking.patientId.fcmToken,
                  doctorName:
                    booking.doctorId.firstName +
                    ' ' +
                    booking.doctorId.lastName,
                  appointmentDate: booking.bookingDate,
                  appointmentTime: booking.bookingTime,
                });
              }
              await this.bookingModel.updateOne(
                { slotId: slot._id },
                { status: BookingStatus.NEEDS_RESCHEDULE },
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
          session,
        );
      }

      await session.commitTransaction();

      if (affectedBookings.length > 0) {
        this.sendBatchNotifications(affectedBookings).catch((err) =>
          this.logger.error('Notification error:', err),
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
        dayOfWeek: dayOfWeek,
        location: location,
      });

      startMinutes += duration;
    }

    return slots;
  }

  private async sendBatchNotifications(
    affectedBookings: Array<{
      bookingId: string;
      fcmToken: string;
      doctorName: string;
      appointmentDate: Date;
      appointmentTime: string;
    }>,
  ): Promise<void> {
    this.logger.log(`📱 Sending FCM to ${affectedBookings.length} patients`);

    const FCM_BATCH_SIZE = 500;

    // Process in batches of 500
    for (let i = 0; i < affectedBookings.length; i += FCM_BATCH_SIZE) {
      const batch = affectedBookings.slice(i, i + FCM_BATCH_SIZE);
      const fcmTokens = batch.map((b) => b.fcmToken);

      const result = await this.fcmService.sendMulticastNotification(
        fcmTokens,
        {
          bookingId: batch.map((b) => b.bookingId),
          doctorName: batch.map((b) => b.doctorName),
          appointmentDate: batch.map((b) => b.appointmentDate),
          appointmentTime: batch.map((b) => b.appointmentTime),
          reason: 'Doctor updated working hours',
          type: 'DOCTOR_CANCELLED',
        },
      );

      this.logger.log(
        `Batch ${i / FCM_BATCH_SIZE + 1}: ✅ ${result.successCount}, ❌ ${result.failureCount}`,
      );

      // Clean up invalid tokens
      if (result.invalidTokens.length > 0) {
        await this.removeInvalidTokens(result.invalidTokens);
      }
    }
  }

  /**
   * Remove invalid FCM tokens
   */
  private async removeInvalidTokens(tokens: string[]): Promise<void> {
    await this.userModel.updateMany(
      { fcmToken: { $in: tokens } },
      { $unset: { fcmToken: '' } },
    );

    this.logger.log(`Removed ${tokens.length} invalid FCM tokens`);
  }
}
