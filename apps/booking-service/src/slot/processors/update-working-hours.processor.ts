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
import { User } from '@app/common/database/schemas/user.schema';
import { Doctor } from '@app/common/database/schemas/doctor.schema';
import { KafkaService } from '@app/common/kafka/kafka.service';
import { KAFKA_TOPICS } from '@app/common/kafka/events/topics';
import { formatDate } from '@app/common/utils/get-syria-date';
import { CacheService } from '@app/common/cache/cache.service';
import { invalidateBookingCaches } from '@app/common/utils/cache-invalidation.util';
import { minutesToTime, timeToMinutes } from '@app/common/utils/time-ago.util';

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
    private kafkaProducer: KafkaService,
    private readonly cacheService: CacheService,
  ) {
    this.logger.log(`[Slot Update Job] Processing for doctor`);
  }

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

    this.logger.log(`beginning of PROCESS_WORKING_HOURS_UPDATE`);

    for (const day of updatedDays) {
      // Idempotency: browser retries republish the same Kafka event, landing
      // multiple jobs on the queue. A per-(doctor, day) Redis lock lets only
      // the first in-flight job process the day; duplicates arriving while
      // the first is running skip cleanly. The lock is released in `finally`
      // so legitimate follow-up edits submitted after the first job finishes
      // are not silently dropped.
      const lockKey = `lock:working_hours_update:${doctorId}:${day}`;
      const acquired = await this.cacheService.acquireLock(lockKey, 300);
      if (!acquired) {
        this.logger.warn(
          `Skipped PROCESS_WORKING_HOURS_UPDATE for doctor=${doctorId} day=${day}: lock ${lockKey} held by concurrent job`,
        );
        continue;
      }

      try {
        await this.processSingleDay(
          doctorObjectId,
          day,
          oldWorkingHours,
          newWorkingHours,
          version,
          inspectionDuration,
          inspectionPrice,
        );
      } finally {
        await this.cacheService.del(lockKey);
      }
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
      const futureDates = this.getNext48WeeksDatesForDay(day);

      // ✅ الـ ranges الجديدة لهذا اليوم فقط
      const validRanges = newWH.filter((w) => w.day === day);

      // Surface a caller contract bug: when `updatedDays` contains a day that
      // has no corresponding entry in `newWorkingHours`, nothing is generated
      // and nothing is updated — the transaction silently commits empty.
      if (validRanges.length === 0) {
        this.logger.warn(
          `No newWorkingHours entries for day=${day} (doctor=${doctorId.toString()}) — ` +
            `nothing will be generated. Caller may have sent a mismatched updatedDays list.`,
        );
      }

      // ✅ الـ locations المتأثرة في هذا اليوم فقط (من oldWH و newWH)
      const affectedLocations = this.getAffectedLocations(day, oldWH, newWH);

      // ✅ Single bulk fetch covering every future occurrence of this weekday
      // in the affected locations — replaces 48 per-week queries. All statuses
      // are pulled (including INVALIDATED) so generateNewSlotsForDate can
      // reactivate candidates from memory instead of round-tripping per slot.
      const windowStart = futureDates[0];
      const windowEnd = new Date(
        futureDates[futureDates.length - 1].getTime() + 24 * 60 * 60 * 1000 - 1,
      );

      const allSlotsInWindow = affectedLocations.length
        ? await this.slotModel
            .find({
              doctorId: doctorId,
              dayOfWeek: day,
              date: { $gte: windowStart, $lte: windowEnd },
              $or: affectedLocations.map((loc) => ({
                'location.type': loc.type,
                'location.entity_name': loc.entity_name,
                'location.address': loc.address,
              })),
            })
            .session(session)
        : [];

      const slotsByDateKey = new Map<string, AppointmentSlotDocument[]>();
      for (const slot of allSlotsInWindow) {
        const key = new Date(slot.date).toISOString().slice(0, 10);
        const bucket = slotsByDateKey.get(key);
        if (bucket) bucket.push(slot);
        else slotsByDateKey.set(key, [slot]);
      }

      this.logger.log(
        `Bulk-fetched ${allSlotsInWindow.length} slots across ${futureDates.length} future ${day}s for doctor ${doctorId.toString()}`,
      );

      for (const date of futureDates) {
        const dateKey = date.toISOString().slice(0, 10);
        const slotsForDate = slotsByDateKey.get(dateKey) ?? [];

        for (const slot of slotsForDate) {
          if (slot.status === SlotStatus.INVALIDATED) continue;
          // ✅ التحقق من الوقت والـ location معاً
          if (this.slotFitsRanges(slot, validRanges)) continue;

          if (slot.status === SlotStatus.BOOKED) {
            const booking = await this.bookingModel
              .findOne({ slotId: slot._id })
              .populate<{ patientId: User }>('patientId', 'fcmToken')
              .populate<{
                doctorId: Doctor;
              }>('doctorId', 'firstName lastName')
              .session(session)
              .exec();

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

        // ✅ توليد slots جديدة — uses pre-fetched list to avoid per-slot lookups
        await this.generateNewSlotsForDate(
          doctorId,
          date,
          validRanges,
          version,
          duration,
          price,
          session,
          slotsForDate,
        );
      }
      await invalidateBookingCaches(this.cacheService, doctorId.toString());
      await session.commitTransaction();

      if (affectedBookings.length > 0) {
        await this.sendPersonalizedNotifications(affectedBookings).catch(
          (err) => this.logger.error('Notification error:', err),
        );
        const affectedPatientIds = [
          ...new Set(affectedBookings.map((b) => b.patientId)),
        ];

        await invalidateBookingCaches(
          this.cacheService,
          doctorId.toString(),
          affectedPatientIds, // ✅ array of all affected patients
          this.logger,
        );
      }
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      await session.endSession();
    }
  }
  private getAffectedLocations(
    day: Days,
    oldWH: WorkingHourRange[],
    newWH: WorkingHourRange[],
  ): Array<{ type: WorkigEntity; entity_name: string; address: string }> {
    const allRelevant = [...oldWH, ...newWH].filter((w) => w.day === day);

    const seen: Record<string, boolean> = {};
    const result: Array<{
      type: WorkigEntity;
      entity_name: string;
      address: string;
    }> = [];

    for (const wh of allRelevant) {
      const key = `${wh.location.type}|${wh.location.entity_name}|${wh.location.address}`;
      if (!seen[key]) {
        seen[key] = true;
        result.push({
          type: wh.location.type,
          entity_name: wh.location.entity_name,
          address: wh.location.address,
        });
      }
    }

    return result;
  }

  private async generateNewSlotsForDate(
    doctorId: Types.ObjectId,
    date: Date,
    ranges: WorkingHourRange[],
    version: number,
    duration: number,
    price: number,
    session: ClientSession,
    slotsForDate: AppointmentSlotDocument[],
  ) {
    for (const range of ranges) {
      const generatedSlots = this.buildSlotsFromRange(
        doctorId,
        date,
        range.startTime,
        range.endTime,
        range.day,
        range.location,
        duration,
        price,
        version,
      );

      for (const slot of generatedSlots) {
        // In-memory check: is there an active (non-INVALIDATED) slot at this
        // exact time+location? Replaces per-slot findOne round-trips.
        const activeExists = slotsForDate.some(
          (s) =>
            s.status !== SlotStatus.INVALIDATED &&
            s.startTime === slot.startTime &&
            s.location?.type === range.location.type &&
            s.location?.entity_name === range.location.entity_name &&
            s.location?.address === range.location.address,
        );

        if (activeExists) continue;

        // In-memory INVALIDATED candidate (match time+entity_name, matching
        // the original reactivation predicate).
        const invalidatedExists = slotsForDate.find(
          (s) =>
            s.status === SlotStatus.INVALIDATED &&
            s.startTime === slot.startTime &&
            s.location?.entity_name === range.location.entity_name,
        );

        if (invalidatedExists) {
          // Guarded: only reactivate if the slot is still INVALIDATED when
          // the update executes. Prevents clobbering a slot that another
          // writer already repurposed in the same window.
          const res = await this.slotModel.updateOne(
            {
              _id: invalidatedExists._id,
              status: SlotStatus.INVALIDATED,
            },
            {
              $set: {
                status: SlotStatus.AVAILABLE,
                startTime: slot.startTime,
                endTime: slot.endTime,
                workingHoursVersion: version,
                duration: duration,
                price: price,
                location: range.location,
                dayOfWeek: range.day,
                date: new Date(date),
              },
              $inc: { version: 1 },
            },
            { session },
          );

          if (res.modifiedCount) {
            // Reflect the change locally so subsequent generated slots in
            // this same loop don't re-pick the same INVALIDATED candidate.
            invalidatedExists.status = SlotStatus.AVAILABLE;
            invalidatedExists.startTime = slot.startTime as string;
            invalidatedExists.endTime = slot.endTime as string;
            invalidatedExists.location = range.location;
          }
        } else {
          // ✅ ولّد slot جديد تماماً
          await this.slotModel.insertMany([slot], { session });
        }
      }
    }
  }

  private getNext48WeeksDatesForDay(day: Days): Date[] {
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
    for (let i = 0; i < 48; i++) {
      const d = dt.plus({ weeks: i });
      dates.push(new Date(Date.UTC(d.year, d.month - 1, d.day, 0, 0, 0, 0)));
    }

    return dates;
  }

  // ✅ التحقق من الوقت والـ location معاً
  private slotFitsRanges(
    slot: AppointmentSlotDocument,
    ranges: WorkingHourRange[],
  ): boolean {
    const slotStart = timeToMinutes(slot.startTime);
    const slotEnd = timeToMinutes(slot.endTime);

    for (const range of ranges) {
      const rangeStart = timeToMinutes(range.startTime);
      const rangeEnd = timeToMinutes(range.endTime);

      const timeMatches = slotStart >= rangeStart && slotEnd <= rangeEnd;
      const locationMatches =
        slot.location.type === range.location.type &&
        slot.location.entity_name === range.location.entity_name &&
        slot.location.address === range.location.address;

      if (timeMatches && locationMatches) {
        return true;
      }
    }

    return false;
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

    let startMinutes = timeToMinutes(startTime);
    const endMinutes = timeToMinutes(endTime);

    while (startMinutes + duration <= endMinutes) {
      const slotStart = minutesToTime(startMinutes);
      const slotEnd = minutesToTime(startMinutes + duration);

      slots.push({
        doctorId,
        date: new Date(date),
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

  // eslint-disable-next-line @typescript-eslint/require-await
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

    const PARALLEL_LIMIT = 10;

    for (let i = 0; i < affectedBookings.length; i += PARALLEL_LIMIT) {
      const batch = affectedBookings.slice(i, i + PARALLEL_LIMIT);

      const promises = batch.map((booking) => {
        try {
          const sent = this.sendDisplacementNotification({
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

      const results = promises;

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

    if (invalidTokens.length > 0) {
      this.logger.warn(`Found ${invalidTokens.length} invalid tokens`);
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
      this.kafkaProducer.emit(
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
