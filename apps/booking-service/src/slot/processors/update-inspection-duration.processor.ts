import { InjectQueue, Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job, Queue } from 'bull';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';
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
import {
  formatArabicDate,
  formatDate,
  getSyriaDate,
} from '@app/common/utils/get-syria-date';
import { CacheService } from '@app/common/cache/cache.service';
import { invalidateBookingCaches } from '@app/common/utils/cache-invalidation.util';

export interface InspectionDurationJobData {
  doctorId: string;
  oldInspectionDuration: number;
  newInspectionDuration: number;
  inspectionPrice?: number;
  workingHours: Array<{
    day: Days;
    location: {
      type: WorkigEntity;
      entity_name: string;
      address: string;
    };
    startTime: string;
    endTime: string;
  }>;
  doctorInfo: { fullName: string };
  version: number;
}

const CANCEL_REASON = 'Doctor updated inspection duration';

@Processor('INSPECTION_DURATION_UPDATE')
export class InspectionDurationUpdateProcessor {
  private readonly logger = new Logger(InspectionDurationUpdateProcessor.name);
  private readonly SLOT_GENERATION_WEEKS = 48;

  // Phase 1 covers today + the next 13 days (weeks 0-1). Phase 2 backfills
  // weeks 2..SLOT_GENERATION_WEEKS. Under Option A each phase's wipe +
  // rebuild is strictly scoped to its own date window so patients never
  // see an empty booking surface for weeks 3+ while Phase 2 is in flight.
  private readonly PHASE1_WEEKS = 2;
  private readonly MS_PER_DAY = 24 * 60 * 60 * 1000;

  constructor(
    @InjectModel(AppointmentSlot.name)
    private slotModel: Model<AppointmentSlotDocument>,
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(Booking.name) private bookingModel: Model<BookingDocument>,
    @InjectModel(Doctor.name) private doctorModel: Model<DoctorDocument>,
    private kafkaProducer: KafkaService,
    private readonly cacheService: CacheService,
    @InjectQueue('INSPECTION_DURATION_UPDATE')
    private readonly selfQueue: Queue,
  ) {}

  @Process('PROCESS_INSPECTION_DURATION_UPDATE')
  async process(job: Job<InspectionDurationJobData>): Promise<void> {
    await this.runPhase(job, {
      phaseLabel: 'Phase 1',
      lockSuffix: '',
      startWeek: 0,
      endWeek: this.PHASE1_WEEKS,
      dispatchPhase2: true,
    });
  }

  @Process('PROCESS_INSPECTION_DURATION_UPDATE_PHASE2')
  async processPhase2(job: Job<InspectionDurationJobData>): Promise<void> {
    // RC-6 (FIX 6): Phase 2 staleness check. A Phase 1 dispatched this Phase
    // 2 at job-creation time, but the doctor may have edited their schedule
    // again before this job ran. The newer Phase 1 will dispatch its own
    // Phase 2 with a higher version, so this stale Phase 2 must skip rather
    // than overwrite the fresh slots. Compare Doctor.workingHoursVersion
    // (bumped by home-service on every working-hours/inspection-duration
    // edit) to the version snapshot baked into this job.
    if (await this.isPhase2Stale(job)) return;

    await this.runPhase(job, {
      phaseLabel: 'Phase 2',
      lockSuffix: ':backfill',
      startWeek: this.PHASE1_WEEKS,
      endWeek: this.SLOT_GENERATION_WEEKS,
      dispatchPhase2: false,
    });
  }

  private async isPhase2Stale(
    job: Job<InspectionDurationJobData>,
  ): Promise<boolean> {
    const { doctorId, version } = job.data;
    const doctor = await this.doctorModel
      .findById(doctorId)
      .select('workingHoursVersion')
      .lean()
      .exec();
    if (!doctor) {
      this.logger.warn(
        `[InspectionDuration] Phase 2 staleness: doctor=${doctorId} not found — skipping (a delete must have happened)`,
      );
      return true;
    }
    const currentVersion = doctor.workingHoursVersion ?? 0;
    const jobVersion = version ?? 0;
    if (currentVersion > jobVersion) {
      this.logger.warn(
        `[InspectionDuration] Phase 2 stale for doctor=${doctorId}: doctor.workingHoursVersion=${currentVersion} > job.version=${jobVersion} — newer Phase 1 will dispatch a fresh Phase 2; skipping`,
      );
      return true;
    }
    return false;
  }

  private async runPhase(
    job: Job<InspectionDurationJobData>,
    opts: {
      phaseLabel: string;
      lockSuffix: string;
      startWeek: number;
      endWeek: number;
      dispatchPhase2: boolean;
    },
  ): Promise<void> {
    const {
      doctorId,
      newInspectionDuration,
      inspectionPrice,
      workingHours,
      doctorInfo,
      version,
    } = job.data;
    const doctorObjectId = new Types.ObjectId(doctorId);
    const { phaseLabel, lockSuffix, startWeek, endWeek, dispatchPhase2 } = opts;

    this.logger.log(
      `Processing INSPECTION_DURATION_UPDATE (${phaseLabel}) for doctor ${doctorId} → ${newInspectionDuration}min`,
    );

    // RC-3 (FIX 3): the doctor-wide `:ALL` lock is the cross-op coordination
    // barrier shared by every slot-affecting processor (create/update/delete
    // working-hours, plus inspection-duration). Inspection duration rebuilds
    // EVERY day, so a concurrent day-op would race on the same slots — the
    // `:ALL` lock prevents that. Inspection-duration grabs `:ALL` only since
    // it is already doctor-wide. On contention we throw (not skip) so Bull
    // retries: contention may come from a day-op holding `:ALL`, in which
    // case dropping the inspection-duration edit would lose the doctor's
    // change. Duplicate Kafka events for the same inspection-duration value
    // simply re-run idempotently after the lock frees. Phase 2 uses a
    // `:backfill` suffix so it doesn't collide with Phase 1.
    const lockKey = `lock:doctor:${doctorId}:ALL${lockSuffix}`;
    const lockToken = await this.cacheService.acquireLock(lockKey, 300);
    if (lockToken === null) {
      // Redis is unreachable — fail loudly so Bull retries instead of
      // silently swallowing the doctor's edit.
      throw new Error(
        `Redis unavailable acquiring ${lockKey} — Bull will retry`,
      );
    }
    if (lockToken === false) {
      this.logger.warn(
        `Contended ${lockKey} for PROCESS_INSPECTION_DURATION_UPDATE (${phaseLabel}) doctor=${doctorId} — throwing for Bull retry (cross-op coord)`,
      );
      throw new Error(
        `Cross-op lock ${lockKey} held — Bull will retry to coordinate with concurrent slot-affecting job`,
      );
    }

    try {
      await this.runInspectionDurationUpdate(
        doctorObjectId,
        newInspectionDuration,
        inspectionPrice,
        workingHours,
        doctorInfo,
        version,
        startWeek,
        endWeek,
        phaseLabel,
      );
    } finally {
      await this.cacheService.releaseLock(lockKey, lockToken);
    }

    if (dispatchPhase2) this.dispatchPhase2(job);
  }

  // Fire-and-forget enqueue. Phase 2 failure here must never throw:
  // Phase 1 has already committed the immediate 2-week changes and
  // dispatched notifications for those bookings.
  private dispatchPhase2(job: Job<InspectionDurationJobData>): void {
    this.selfQueue
      .add('PROCESS_INSPECTION_DURATION_UPDATE_PHASE2', job.data)
      .then(() => {
        this.logger.log(
          `[InspectionDuration] Phase 2 backfill dispatched for doctor ${job.data.doctorId}`,
        );
      })
      .catch((error) => {
        const err = error as Error;
        this.logger.error(
          `[InspectionDuration] ❌ Failed to dispatch Phase 2 backfill for doctor ${job.data.doctorId}: ${err.message}`,
          err.stack,
        );
      });
  }

  private async runInspectionDurationUpdate(
    doctorObjectId: Types.ObjectId,
    newInspectionDuration: number,
    inspectionPrice: number | undefined,
    workingHours: InspectionDurationJobData['workingHours'],
    doctorInfo: { fullName: string },
    version: number,
    startWeek: number,
    endWeek: number,
    phaseLabel: string,
  ): Promise<void> {
    const doctorId = doctorObjectId.toString();

    const today = getSyriaDate();
    const todayStart = new Date(today);
    todayStart.setUTCHours(0, 0, 0, 0);

    // Compute this phase's date window. Phase 1: days 0-13 from today.
    // Phase 2: days 14-335 from today. Both inclusive.
    const phaseStart = new Date(
      todayStart.getTime() + startWeek * 7 * this.MS_PER_DAY,
    );
    const phaseEnd = new Date(
      todayStart.getTime() + endWeek * 7 * this.MS_PER_DAY - 1,
    );
    const dateFilter = { $gte: phaseStart, $lte: phaseEnd };

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

    let newSlots: Partial<AppointmentSlot>[] = [];

    try {
      const bookedSlots = await this.slotModel
        .find({
          doctorId: doctorObjectId,
          date: dateFilter,
          status: SlotStatus.BOOKED,
        })
        .session(session);

      const invalidatedSlotIds: Types.ObjectId[] = [];

      for (const slot of bookedSlots) {
        const booking = await this.bookingModel
          .findOne({ slotId: slot._id })
          .populate<{ patientId: User }>('patientId', 'fcmToken')
          .populate<{ doctorId: Doctor }>('doctorId', 'firstName lastName')
          .session(session)
          .exec();

        if (!booking) {
          // Slot was BOOKED in our snapshot but no booking exists — keep the
          // slot in the invalidated audit set so it isn't deleted entirely.
          invalidatedSlotIds.push(slot._id);
          continue;
        }

        // RC-8 guard: only overwrite bookings that are still actionable. If
        // the patient already cancelled or the booking otherwise reached a
        // terminal state, leave their audit trail intact and do not send
        // them an FCM notification. The slot itself still needs cleanup.
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
            `[InspectionDurationUpdate] Booking ${booking._id.toString()} already finalized, skipping cancellation+notification`,
          );
          invalidatedSlotIds.push(slot._id);
          continue;
        }

        const patient =
          booking.patientId && typeof booking.patientId !== 'string'
            ? (booking.patientId as unknown as User)
            : null;
        const doctor =
          booking.doctorId && typeof booking.doctorId !== 'string'
            ? (booking.doctorId as unknown as Doctor)
            : null;

        const doctorName = doctor
          ? `${doctor.firstName} ${doctor.lastName}`
          : doctorInfo.fullName;

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

        invalidatedSlotIds.push(slot._id);
      }

      // Keep INVALIDATED audit rows ONLY for slots tied to cancelled bookings.
      // Delete every other future slot so the unique index
      // { doctorId, date, startTime, 'location.entity_name' } is clear before
      // regeneration — otherwise insertMany hits 11000 and new slots are dropped.
      if (invalidatedSlotIds.length > 0) {
        await this.slotModel.updateMany(
          { _id: { $in: invalidatedSlotIds } },
          { $set: { status: SlotStatus.INVALIDATED } },
          { session },
        );
      }

      await this.slotModel.deleteMany(
        {
          doctorId: doctorObjectId,
          date: dateFilter,
          _id: { $nin: invalidatedSlotIds },
        },
        { session },
      );

      // FIX 2 / RC-5: rebuild slots INSIDE the transaction. Previously the
      // wipe (deleteMany above) committed and the rebuild ran post-session.
      // A worker crash between the two left the doctor's calendar empty
      // forever once Bull's 3 retries were exhausted. Doing the rebuild
      // inside the same transaction makes the wipe-and-rebuild atomic.
      const keptInvalidated = await this.slotModel
        .find({
          doctorId: doctorObjectId,
          status: SlotStatus.INVALIDATED,
          date: dateFilter,
        })
        .select('date startTime location.entity_name')
        .session(session)
        .lean()
        .exec();

      const blockedKeys = new Set(
        keptInvalidated.map(
          (s) =>
            `${new Date(s.date).toISOString()}|${s.startTime}|${s.location?.entity_name ?? ''}`,
        ),
      );

      newSlots = this.buildNewSlots(
        doctorObjectId,
        workingHours,
        newInspectionDuration,
        inspectionPrice,
        doctorInfo,
        version,
        startWeek,
        endWeek,
      ).filter((s) => {
        const key = `${(s.date as Date).toISOString()}|${s.startTime}|${s.location?.entity_name ?? ''}`;
        return !blockedKeys.has(key);
      });

      await this.batchInsertSlots(newSlots, session);

      await session.commitTransaction();
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      await session.endSession();
    }

    this.logger.log(
      `Regenerated ${newSlots.length} slots for doctor ${doctorId} at ${newInspectionDuration}min duration (${phaseLabel})`,
    );

    if (affectedBookings.length > 0) {
      await this.sendCancellationNotifications(affectedBookings).catch((err) =>
        this.logger.error('FCM notification error:', err),
      );
    }

    if (affectedManualBookings.length > 0) {
      this.sendWhatsappCancellations(affectedManualBookings);
    }

    const affectedPatientIds = [
      ...new Set(affectedBookings.map((b) => b.patientId)),
    ];
    await invalidateBookingCaches(
      this.cacheService,
      doctorObjectId.toString(),
      affectedPatientIds.length > 0 ? affectedPatientIds : undefined,
      this.logger,
    );

    this.logger.log(
      `INSPECTION_DURATION_UPDATE (${phaseLabel}) done. Cancelled: ${affectedBookings.length} (app), ${affectedManualBookings.length} (manual).`,
    );
  }

  private buildNewSlots(
    doctorId: Types.ObjectId,
    workingHours: InspectionDurationJobData['workingHours'],
    duration: number,
    price: number | undefined,
    doctorInfo: { fullName: string },
    version: number,
    startWeek: number,
    endWeek: number,
  ): Partial<AppointmentSlot>[] {
    const slots: Partial<AppointmentSlot>[] = [];
    const today = getSyriaDate();

    for (let week = startWeek; week < endWeek; week++) {
      for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
        const currentDate = new Date(today);
        currentDate.setDate(today.getDate() + week * 7 + dayOffset);
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
              duration,
              wh.location,
              price,
              doctorInfo,
              version,
            ),
          );
        }
      }
    }
    return slots;
  }

  private generateSlotsForDay(
    doctorId: Types.ObjectId,
    date: Date,
    dayOfWeek: Days,
    startTime: string,
    endTime: string,
    duration: number,
    location: any,
    price: number | undefined,
    doctorInfo: { fullName: string },
    version: number,
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

      const slotDate = new Date(date);
      slotDate.setUTCHours(0, 0, 0, 0);

      slots.push({
        doctorId,
        status: SlotStatus.AVAILABLE,
        date: slotDate,
        startTime: `${String(slotStartHour).padStart(2, '0')}:${String(slotStartMin).padStart(2, '0')}`,
        endTime: `${String(slotEndHour).padStart(2, '0')}:${String(slotEndMin).padStart(2, '0')}`,
        dayOfWeek,
        duration,
        price,
        location,
        doctorInfo: { fullName: doctorInfo.fullName },
        isRecurring: true,
        workingHoursVersion: version,
      });

      currentMinutes += duration;
    }
    return slots;
  }

  private async batchInsertSlots(
    slots: Partial<AppointmentSlot>[],
    session?: ClientSession,
  ): Promise<void> {
    if (slots.length === 0) return;
    const BATCH_SIZE = 100;
    for (let i = 0; i < slots.length; i += BATCH_SIZE) {
      const batch = slots.slice(i, i + BATCH_SIZE);
      try {
        await this.slotModel.insertMany(batch, { ordered: false, session });
      } catch (error: any) {
        if (error?.code !== 11000) throw error;
        // Inside a transaction, a duplicate-key collision means our
        // pre-filter (blockedKeys) missed something — abort rather than
        // commit a half-rebuilt calendar; Bull will retry.
        if (session) throw error;
        this.logger.warn(
          `Skipped duplicate slots in batch ${i / BATCH_SIZE + 1}`,
        );
      }
    }
  }

  private getDayName(utcDay: number): string {
    return [
      'sunday',
      'monday',
      'tuesday',
      'wednesday',
      'thursday',
      'friday',
      'saturday',
    ][utcDay];
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
          `Failed to publish FCM notification for booking ${booking.bookingId}: ${err.message}`,
        );
      }
    }
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
        `📋 *السبب:* قام الطبيب بتحديث مدة الكشف\n\n` +
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
}
