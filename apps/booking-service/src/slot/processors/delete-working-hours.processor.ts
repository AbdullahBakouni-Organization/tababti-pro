import { InjectQueue, Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job, Queue } from 'bull';
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
import {
  Doctor,
  DoctorDocument,
} from '@app/common/database/schemas/doctor.schema';
import { KafkaService } from '@app/common/kafka/kafka.service';
import { KAFKA_TOPICS } from '@app/common/kafka/events/topics';
import { formatArabicDate, formatDate } from '@app/common/utils/get-syria-date';
import { CacheService } from '@app/common/cache/cache.service';
import { invalidateBookingCaches } from '@app/common/utils/cache-invalidation.util';
import { timeToMinutes } from '@app/common/utils/time-ago.util';

export interface WorkingHoursDeleteJobData {
  doctorId: string;
  deletedWorkingHour: {
    day: Days;
    location: {
      type: WorkigEntity;
      entity_name: string;
      address: string;
    };
    startTime: string;
    endTime: string;
  };
  version: number;
}

const CANCEL_REASON = 'Working hours removed by doctor';

@Processor('WORKING_HOURS_DELETE')
export class WorkingHoursDeleteProcessor {
  private readonly logger = new Logger(WorkingHoursDeleteProcessor.name);

  // Phase 1 covers today + the next 13 days (2 future occurrences of the
  // target weekday). Phase 2 backfills the remaining 46 occurrences.
  private readonly PHASE1_WEEKS = 2;
  private readonly TOTAL_WEEKS = 48;

  constructor(
    @InjectModel(AppointmentSlot.name)
    private slotModel: Model<AppointmentSlotDocument>,
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(Booking.name) private bookingModel: Model<BookingDocument>,
    @InjectModel(Doctor.name) private doctorModel: Model<DoctorDocument>,
    private kafkaProducer: KafkaService,
    private readonly cacheService: CacheService,
    @InjectQueue('WORKING_HOURS_DELETE')
    private readonly selfQueue: Queue,
  ) {}

  @Process('PROCESS_WORKING_HOURS_DELETE')
  async processWorkingHoursDelete(
    job: Job<WorkingHoursDeleteJobData>,
  ): Promise<void> {
    await this.runDeletePhase(job, {
      phaseLabel: 'Phase 1',
      lockSuffix: '',
      startWeek: 0,
      endWeek: this.PHASE1_WEEKS,
      dispatchPhase2: true,
    });
  }

  @Process('PROCESS_WORKING_HOURS_DELETE_PHASE2')
  async processWorkingHoursDeletePhase2(
    job: Job<WorkingHoursDeleteJobData>,
  ): Promise<void> {
    // RC-6 (FIX 6): Phase 2 staleness check — see InspectionDurationUpdate
    // Processor for the full rationale. If the doctor's
    // `workingHoursVersion` has advanced past this job's snapshot, a newer
    // Phase 1 will dispatch a fresh Phase 2 — skip cleanly.
    if (await this.isPhase2Stale(job)) return;

    await this.runDeletePhase(job, {
      phaseLabel: 'Phase 2',
      lockSuffix: ':backfill',
      startWeek: this.PHASE1_WEEKS,
      endWeek: this.TOTAL_WEEKS,
      dispatchPhase2: false,
    });
  }

  private async isPhase2Stale(
    job: Job<WorkingHoursDeleteJobData>,
  ): Promise<boolean> {
    const { doctorId, version } = job.data;
    const doctor = await this.doctorModel
      .findById(doctorId)
      .select('workingHoursVersion')
      .lean()
      .exec();
    if (!doctor) {
      this.logger.warn(
        `[WorkingHoursDelete] Phase 2 staleness: doctor=${doctorId} not found — skipping`,
      );
      return true;
    }
    const currentVersion = doctor.workingHoursVersion ?? 0;
    const jobVersion = version ?? 0;
    if (currentVersion > jobVersion) {
      this.logger.warn(
        `[WorkingHoursDelete] Phase 2 stale for doctor=${doctorId}: doctor.workingHoursVersion=${currentVersion} > job.version=${jobVersion} — newer Phase 1 will dispatch a fresh Phase 2; skipping`,
      );
      return true;
    }
    return false;
  }

  private async runDeletePhase(
    job: Job<WorkingHoursDeleteJobData>,
    opts: {
      phaseLabel: string;
      lockSuffix: string;
      startWeek: number;
      endWeek: number;
      dispatchPhase2: boolean;
    },
  ): Promise<void> {
    const { doctorId, deletedWorkingHour } = job.data;
    const doctorObjectId = new Types.ObjectId(doctorId);
    const { phaseLabel, lockSuffix, startWeek, endWeek, dispatchPhase2 } = opts;

    this.logger.log(
      `Processing WORKING_HOURS_DELETE (${phaseLabel}) for doctor ${doctorId} on ${deletedWorkingHour.day} @ ${deletedWorkingHour.location.entity_name}`,
    );

    // Idempotency: browser retries republish the same Kafka event, landing
    // multiple jobs on the queue. A per-(doctor, day) Redis lock lets only
    // the first in-flight job invalidate the day; duplicates arriving while
    // the first is running skip cleanly. The lock is released in `finally`
    // so legitimate follow-up edits after the job completes aren't dropped.
    // Phase 2 uses a `:backfill` suffix so it doesn't collide with Phase 1.
    const lockKey = `lock:working_hours_delete:${doctorId}:${deletedWorkingHour.day}${lockSuffix}`;
    const lockToken = await this.cacheService.acquireLock(lockKey, 300);
    if (lockToken === null) {
      // Redis is unreachable — fail loudly so Bull retries instead of
      // silently swallowing the doctor's delete.
      throw new Error(
        `Redis unavailable acquiring ${lockKey} — Bull will retry`,
      );
    }
    if (lockToken === false) {
      this.logger.warn(
        `Skipped PROCESS_WORKING_HOURS_DELETE (${phaseLabel}) for doctor=${doctorId} day=${deletedWorkingHour.day}: lock ${lockKey} held by concurrent job`,
      );
      // Concurrent Phase 1 run will dispatch its own Phase 2; skip here.
      return;
    }

    // RC-3 (FIX 3): cross-op outer lock. Day-locks dedup duplicate kafka
    // events for the SAME day-op, but a concurrent inspection-duration
    // (which rewrites every day) would still race on the same slots. The
    // `:ALL` lock is shared with create/update/inspection so only one
    // slot-affecting op runs per (doctor, phase) at a time. We throw on
    // contention (not skip) because dropping the doctor's delete would lose
    // their edit — Bull retries until the cross-op holder releases.
    // Acquire AFTER the day-lock so inner-most lock is released first;
    // release order in finally is reverse.
    const allLockKey = `lock:doctor:${doctorId}:ALL${lockSuffix}`;
    const allLockToken = await this.cacheService.acquireLock(allLockKey, 300);
    if (allLockToken === null) {
      await this.cacheService.releaseLock(lockKey, lockToken);
      throw new Error(
        `Redis unavailable acquiring ${allLockKey} — Bull will retry`,
      );
    }
    if (allLockToken === false) {
      await this.cacheService.releaseLock(lockKey, lockToken);
      this.logger.warn(
        `Contended ${allLockKey} for PROCESS_WORKING_HOURS_DELETE (${phaseLabel}) doctor=${doctorId} day=${deletedWorkingHour.day} — throwing for Bull retry (cross-op coord)`,
      );
      throw new Error(
        `Cross-op lock ${allLockKey} held — Bull will retry to coordinate with concurrent slot-affecting job`,
      );
    }

    try {
      await this.processDeletionForWeeks(
        doctorObjectId,
        deletedWorkingHour,
        startWeek,
        endWeek,
        phaseLabel,
      );
    } finally {
      await this.cacheService.releaseLock(allLockKey, allLockToken);
      await this.cacheService.releaseLock(lockKey, lockToken);
    }

    if (dispatchPhase2) this.dispatchPhase2(job);
  }

  // Fire-and-forget enqueue. Phase 2 failure here must never throw: Phase 1
  // has already committed its slot invalidations and notifications.
  private dispatchPhase2(job: Job<WorkingHoursDeleteJobData>): void {
    this.selfQueue
      .add('PROCESS_WORKING_HOURS_DELETE_PHASE2', job.data)
      .then(() => {
        this.logger.log(
          `[WorkingHoursDelete] Phase 2 backfill dispatched for doctor ${job.data.doctorId}`,
        );
      })
      .catch((error) => {
        const err = error as Error;
        this.logger.error(
          `[WorkingHoursDelete] ❌ Failed to dispatch Phase 2 backfill for doctor ${job.data.doctorId}: ${err.message}`,
          err.stack,
        );
      });
  }

  private async processDeletionForWeeks(
    doctorObjectId: Types.ObjectId,
    deletedWorkingHour: WorkingHoursDeleteJobData['deletedWorkingHour'],
    startWeek: number,
    endWeek: number,
    phaseLabel: string,
  ): Promise<void> {
    const doctorId = doctorObjectId.toString();

    const futureDates = this.getNext48WeeksDatesForDay(
      deletedWorkingHour.day,
    ).slice(startWeek, endWeek);

    if (futureDates.length === 0) return;

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

    const affectedManualBookings: Array<{
      bookingId: string;
      patientName: string;
      patientPhone: string;
      doctorName: string;
      appointmentDate: Date;
      appointmentTime: string;
    }> = [];

    try {
      const entryStart = timeToMinutes(deletedWorkingHour.startTime);
      const entryEnd = timeToMinutes(deletedWorkingHour.endTime);

      // Single bulk fetch covering every future occurrence of this weekday
      // at the deleted location within this phase's week slice.
      const windowStart = futureDates[0];
      const windowEnd = new Date(
        futureDates[futureDates.length - 1].getTime() + 24 * 60 * 60 * 1000 - 1,
      );

      const candidateSlotsAll = await this.slotModel
        .find({
          doctorId: doctorObjectId,
          dayOfWeek: deletedWorkingHour.day,
          date: { $gte: windowStart, $lte: windowEnd },
          status: { $ne: SlotStatus.INVALIDATED },
          'location.type': deletedWorkingHour.location.type,
          'location.entity_name': deletedWorkingHour.location.entity_name,
          'location.address': deletedWorkingHour.location.address,
        })
        .session(session);

      this.logger.log(
        `Bulk-fetched ${candidateSlotsAll.length} slots across ${futureDates.length} future ${deletedWorkingHour.day}s for doctor ${doctorId} (${phaseLabel})`,
      );

      for (const slot of candidateSlotsAll) {
        const slotStart = timeToMinutes(slot.startTime);
        const slotEnd = timeToMinutes(slot.endTime);
        if (slotStart < entryStart || slotEnd > entryEnd) continue;

        if (slot.status === SlotStatus.BOOKED) {
          await this.cancelBookingForSlot(
            slot._id,
            session,
            affectedBookings,
            affectedManualBookings,
          );
        }

        // RC-3 guard: status filter prevents overwriting a slot that was
        // booked between the bulk find and this write. Without it,
        // `slot.save()` would silently clobber a fresh BOOKED status with
        // INVALIDATED and the patient would never be notified.
        const expectedStatus = slot.status;
        const res = await this.slotModel.updateOne(
          { _id: slot._id, status: expectedStatus },
          {
            $set: { status: SlotStatus.INVALIDATED },
            $inc: { version: 1 },
          },
          { session },
        );

        if (res.modifiedCount === 0) {
          const fresh = await this.slotModel
            .findById(slot._id)
            .session(session)
            .exec();

          if (!fresh) {
            this.logger.warn(
              `[WorkingHoursDelete] Slot ${slot._id.toString()} disappeared mid-job for doctor ${doctorId}`,
            );
            continue;
          }

          if (fresh.status === SlotStatus.INVALIDATED) {
            this.logger.warn(
              `[WorkingHoursDelete] Race on slot ${slot._id.toString()} for doctor ${doctorId}: already INVALIDATED (was ${expectedStatus} at read)`,
            );
            continue;
          }

          if (fresh.status === SlotStatus.BOOKED) {
            this.logger.warn(
              `[WorkingHoursDelete] Race on slot ${slot._id.toString()} for doctor ${doctorId}: BOOKED between read and write (was ${expectedStatus} at read) — cancelling fresh booking`,
            );
            await this.cancelBookingForSlot(
              fresh._id,
              session,
              affectedBookings,
              affectedManualBookings,
            );
          } else {
            this.logger.warn(
              `[WorkingHoursDelete] Race on slot ${slot._id.toString()} for doctor ${doctorId}: status drifted ${expectedStatus} → ${fresh.status}`,
            );
          }

          await this.slotModel.updateOne(
            { _id: fresh._id, status: fresh.status },
            {
              $set: { status: SlotStatus.INVALIDATED },
              $inc: { version: 1 },
            },
            { session },
          );
        }
      }

      await session.commitTransaction();

      if (affectedBookings.length > 0) {
        await this.sendCancellationNotifications(affectedBookings).catch(
          (err) => this.logger.error('Notification error:', err),
        );
        const affectedPatientIds = [
          ...new Set(affectedBookings.map((b) => b.patientId)),
        ];
        await invalidateBookingCaches(
          this.cacheService,
          doctorObjectId.toString(),
          affectedPatientIds,
          this.logger,
        );
      } else {
        await invalidateBookingCaches(
          this.cacheService,
          doctorObjectId.toString(),
        );
      }

      if (affectedManualBookings.length > 0) {
        this.sendWhatsappCancellations(affectedManualBookings);
      }

      this.logger.log(
        `WORKING_HOURS_DELETE (${phaseLabel}) done. Affected bookings: ${affectedBookings.length} (app), ${affectedManualBookings.length} (manual)`,
      );
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      await session.endSession();
    }
  }

  private async cancelBookingForSlot(
    slotId: Types.ObjectId,
    session: ClientSession,
    affectedBookings: Array<{
      bookingId: string;
      doctorId: string;
      fcmToken: string;
      patientId: string;
      doctorName: string;
      appointmentDate: Date;
      appointmentTime: string;
    }>,
    affectedManualBookings: Array<{
      bookingId: string;
      patientName: string;
      patientPhone: string;
      doctorName: string;
      appointmentDate: Date;
      appointmentTime: string;
    }>,
  ): Promise<void> {
    const booking = await this.bookingModel
      .findOne({ slotId })
      .populate<{ patientId: User }>('patientId', 'fcmToken')
      .populate<{ doctorId: Doctor }>('doctorId', 'firstName lastName')
      .session(session)
      .exec();

    if (!booking) return;

    // RC-8 guard: only overwrite bookings that are still actionable. If the
    // patient already cancelled or the booking otherwise reached a terminal
    // state, do not clobber their audit trail and do not send them an FCM
    // notification.
    const updateRes = await this.bookingModel.updateOne(
      {
        _id: booking._id,
        status: {
          $in: [
            BookingStatus.PENDING,
            BookingStatus.CONFIRMED,
            BookingStatus.RESCHEDULED,
          ],
        },
      },
      {
        $set: {
          status: BookingStatus.CANCELLED_BY_DOCTOR,
          cancellation: {
            cancelledBy: 'DOCTOR',
            reason: CANCEL_REASON,
            cancelledAt: new Date(),
          },
        },
      },
      { session },
    );

    if (updateRes.modifiedCount === 0) {
      this.logger.log(
        `[WorkingHoursDelete] Booking ${booking._id.toString()} already finalized, skipping cancellation+notification`,
      );
      return;
    }

    const patient =
      booking.patientId && typeof booking.patientId !== 'string'
        ? (booking.patientId as unknown as User)
        : null;
    const doctor =
      booking.doctorId && typeof booking.doctorId !== 'string'
        ? (booking.doctorId as unknown as Doctor)
        : null;

    const doctorName = doctor ? `${doctor.firstName} ${doctor.lastName}` : '';

    if (patient?.fcmToken && doctor) {
      affectedBookings.push({
        bookingId: booking._id.toString(),
        patientId: patient._id.toString(),
        doctorId: doctor._id.toString(),
        fcmToken: patient.fcmToken,
        doctorName,
        appointmentDate: booking.bookingDate,
        appointmentTime: booking.bookingTime,
      });
    } else if (!patient && booking.patientPhone) {
      affectedManualBookings.push({
        bookingId: booking._id.toString(),
        patientName: booking.patientName ?? '',
        patientPhone: booking.patientPhone,
        doctorName,
        appointmentDate: booking.bookingDate,
        appointmentTime: booking.bookingTime,
      });
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
    while (dt.weekday !== target) dt = dt.plus({ days: 1 });

    const dates: Date[] = [];
    for (let i = 0; i < 48; i++) {
      const d = dt.plus({ weeks: i });
      dates.push(new Date(Date.UTC(d.year, d.month - 1, d.day, 0, 0, 0, 0)));
    }
    return dates;
  }

  private sendWhatsappCancellations(
    manual: Array<{
      bookingId: string;
      patientName: string;
      patientPhone: string;
      doctorName: string;
      appointmentDate: Date;
      appointmentTime: string;
    }>,
  ): void {
    this.logger.log(
      `Publishing WhatsApp cancellations for ${manual.length} manual patient(s)`,
    );

    for (const b of manual) {
      if (!b.patientPhone) continue;

      const dateStr = formatArabicDate(b.appointmentDate);
      const greeting = b.patientName
        ? `عزيزي/عزيزتي ${b.patientName}`
        : 'عزيزي المريض';
      const text =
        `${greeting} 👋\n\n` +
        `نأسف لإبلاغك بأنه تم إلغاء موعدك مع الدكتور *${b.doctorName}*.\n\n` +
        `📅 *التاريخ:* ${dateStr}\n` +
        `⏰ *الوقت:* ${b.appointmentTime}\n` +
        `📋 *السبب:* تم إلغاء ساعات العمل من قبل الطبيب\n\n` +
        `يرجى التواصل مع العيادة لإعادة جدولة موعد جديد.\n\n` +
        `— فريق *طبابتي* 💙`;

      try {
        this.kafkaProducer.emit(KAFKA_TOPICS.WHATSAPP_SEND_MESSAGE, {
          phone: b.patientPhone,
          text,
          lang: 'ar',
        });
      } catch (error) {
        const err = error as Error;
        this.logger.error(
          `Failed to emit WhatsApp cancellation for booking ${b.bookingId}: ${err.message}`,
        );
      }
    }
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  private async sendCancellationNotifications(
    affected: Array<{
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
      `Publishing cancellation notifications for ${affected.length} patients`,
    );

    for (const booking of affected) {
      if (!booking.fcmToken) continue;

      const event = {
        eventType: 'BOOKING_CANCELLED_NOTIFICATION',
        timestamp: new Date(),
        data: {
          patientId: booking.patientId,
          doctorId: booking.doctorId,
          doctorName: booking.doctorName,
          fcmToken: booking.fcmToken,
          bookingId: booking.bookingId,
          appointmentDate: formatDate(booking.appointmentDate),
          appointmentTime: booking.appointmentTime,
          reason: CANCEL_REASON,
          type: 'DOCTOR_CANCELLED',
        },
        metadata: { source: 'notification-service', version: '1.0' },
      };

      try {
        this.kafkaProducer.emit(
          KAFKA_TOPICS.BOOKING_CANCELLED_NOTIFICATION,
          event,
        );
      } catch (error) {
        const err = error as Error;
        this.logger.error(
          `Failed to publish cancellation notification for booking ${booking.bookingId}: ${err.message}`,
        );
      }
    }
  }
}
