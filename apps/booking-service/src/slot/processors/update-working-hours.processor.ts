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
    @InjectQueue('WORKING_HOURS_UPDATE')
    private readonly selfQueue: Queue,
  ) {
    this.logger.log(`[Slot Update Job] Processing for doctor`);
  }

  @Process('PROCESS_WORKING_HOURS_UPDATE')
  async processWorkingHoursUpdate(
    job: Job<WorkingHoursUpdateJobData>,
  ): Promise<void> {
    await this.runUpdatePhase(job, {
      phaseLabel: 'Phase 1',
      lockSuffix: '',
      startWeek: 0,
      endWeek: this.PHASE1_WEEKS,
      dispatchPhase2: true,
    });
  }

  @Process('PROCESS_WORKING_HOURS_UPDATE_PHASE2')
  async processWorkingHoursUpdatePhase2(
    job: Job<WorkingHoursUpdateJobData>,
  ): Promise<void> {
    // RC-6 (FIX 6): Phase 2 staleness check — see InspectionDurationUpdate
    // Processor for the full rationale. Skip if a newer Phase 1 has bumped
    // Doctor.workingHoursVersion past this job's snapshot.
    // Staleness-skip leaves the `phase2:running` key intact so the newer
    // Phase 2 (which owns the key) can still signal the frontend.
    if (await this.isPhase2Stale(job)) return;

    try {
      await this.runUpdatePhase(job, {
        phaseLabel: 'Phase 2',
        lockSuffix: ':backfill',
        startWeek: this.PHASE1_WEEKS,
        endWeek: this.TOTAL_WEEKS,
        dispatchPhase2: false,
      });
    } finally {
      await this.clearPhase2RunningKey(job.data.doctorId);
    }
  }

  // Frontend polls `phase2:running:<doctorId>` to know whether background
  // backfill is still in flight. Never allow a Redis error to swallow the
  // Phase 2 result — the TTL baked in at SET time is the crash-safety net.
  private async clearPhase2RunningKey(doctorId: string): Promise<void> {
    try {
      await this.cacheService.del(`phase2:running:${doctorId}`);
    } catch (err) {
      const e = err as Error;
      this.logger.warn(
        `Failed to clear phase2:running key for doctor ${doctorId}: ${e.message}`,
      );
    }
  }

  private async isPhase2Stale(
    job: Job<WorkingHoursUpdateJobData>,
  ): Promise<boolean> {
    const { doctorId, version } = job.data;
    const doctor = await this.doctorModel
      .findById(doctorId)
      .select('workingHoursVersion')
      .lean()
      .exec();
    if (!doctor) {
      this.logger.warn(
        `[WorkingHoursUpdate] Phase 2 staleness: doctor=${doctorId} not found — skipping`,
      );
      return true;
    }
    const currentVersion = doctor.workingHoursVersion ?? 0;
    const jobVersion = version ?? 0;
    if (currentVersion > jobVersion) {
      this.logger.warn(
        `[WorkingHoursUpdate] Phase 2 stale for doctor=${doctorId}: doctor.workingHoursVersion=${currentVersion} > job.version=${jobVersion} — newer Phase 1 will dispatch a fresh Phase 2; skipping`,
      );
      return true;
    }
    return false;
  }

  private async runUpdatePhase(
    job: Job<WorkingHoursUpdateJobData>,
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
      oldWorkingHours,
      newWorkingHours,
      inspectionDuration,
      inspectionPrice,
      version,
      updatedDays,
    } = job.data;
    const { phaseLabel, lockSuffix, startWeek, endWeek, dispatchPhase2 } = opts;

    const doctorObjectId = new Types.ObjectId(doctorId);

    this.logger.log(
      `beginning of PROCESS_WORKING_HOURS_UPDATE (${phaseLabel}) for doctor ${doctorId}`,
    );

    for (const day of updatedDays) {
      // Idempotency: browser retries republish the same Kafka event, landing
      // multiple jobs on the queue. A per-(doctor, day) Redis lock lets only
      // the first in-flight job process the day; duplicates arriving while
      // the first is running skip cleanly. The lock is released in `finally`
      // so legitimate follow-up edits submitted after the first job finishes
      // are not silently dropped. Phase 2 uses a `:backfill` suffix so the
      // backfill lock is independent of Phase 1.
      const lockKey = `lock:working_hours_update:${doctorId}:${day}${lockSuffix}`;
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
          `Skipped PROCESS_WORKING_HOURS_UPDATE (${phaseLabel}) for doctor=${doctorId} day=${day}: lock ${lockKey} held by concurrent job`,
        );
        continue;
      }

      // RC-3 (FIX 3): cross-op outer lock shared with create/delete/
      // inspection so only one slot-affecting op runs per (doctor, phase)
      // at a time. Throw on contention so Bull retries — skipping would
      // drop the doctor's edit if an inspection-duration job (which rewrites
      // every day) is in flight. Acquired after the day-lock; released in
      // reverse order in finally.
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
          `Contended ${allLockKey} for PROCESS_WORKING_HOURS_UPDATE (${phaseLabel}) doctor=${doctorId} day=${day} — throwing for Bull retry (cross-op coord)`,
        );
        throw new Error(
          `Cross-op lock ${allLockKey} held — Bull will retry to coordinate with concurrent slot-affecting job`,
        );
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
          startWeek,
          endWeek,
        );
      } finally {
        await this.cacheService.releaseLock(allLockKey, allLockToken);
        await this.cacheService.releaseLock(lockKey, lockToken);
      }
    }

    if (dispatchPhase2) this.dispatchPhase2(job);
  }

  // Fire-and-forget enqueue. Phase 2 failure here must never throw: Phase 1
  // has already committed the immediate 2-week slot changes and emitted
  // notifications. We log loudly for ops alerting but preserve the Phase 1
  // result unconditionally. After a successful enqueue we set
  // `phase2:running:<doctorId>` so the frontend polling endpoint can report
  // progress; a SET failure is logged as a warning but never throws.
  private dispatchPhase2(job: Job<WorkingHoursUpdateJobData>): void {
    const doctorId = job.data.doctorId;
    this.selfQueue
      .add('PROCESS_WORKING_HOURS_UPDATE_PHASE2', job.data)
      .then(() => {
        this.logger.log(
          `[WorkingHoursUpdate] Phase 2 backfill dispatched for doctor ${doctorId}`,
        );
        return this.cacheService
          .set(
            `phase2:running:${doctorId}`,
            JSON.stringify({
              operation: 'update',
              startedAt: new Date().toISOString(),
            }),
            900,
            900,
          )
          .catch((err) => {
            const e = err as Error;
            this.logger.warn(
              `Failed to SET phase2:running for doctor ${doctorId}: ${e.message}`,
            );
          });
      })
      .catch((error) => {
        const err = error as Error;
        this.logger.error(
          `[WorkingHoursUpdate] ❌ Failed to dispatch Phase 2 backfill for doctor ${doctorId}: ${err.message}`,
          err.stack,
        );
      });
  }

  private async processSingleDay(
    doctorId: Types.ObjectId,
    day: Days,
    oldWH: WorkingHourRange[],
    newWH: WorkingHourRange[],
    version: number,
    duration: number,
    price: number,
    startWeek: number,
    endWeek: number,
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
      const futureDates = this.getNext48WeeksDatesForDay(day).slice(
        startWeek,
        endWeek,
      );

      // Empty slice (e.g. Phase 2 called with startWeek >= 48) — nothing to
      // do, commit the empty transaction and return cleanly.
      if (futureDates.length === 0) {
        await session.commitTransaction();
        return;
      }

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
            await this.cancelBookingForSlot(
              slot._id,
              session,
              affectedBookings,
            );
          }

          // RC-3 guard: status filter prevents overwriting a slot booked
          // between the bulk find and this write. Without it, `slot.save()`
          // would silently clobber a fresh BOOKED status with INVALIDATED
          // and the patient would never be notified.
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
                `[WorkingHoursUpdate] Slot ${slot._id.toString()} disappeared mid-job for doctor ${doctorId.toString()}`,
              );
              continue;
            }

            if (fresh.status === SlotStatus.INVALIDATED) {
              this.logger.warn(
                `[WorkingHoursUpdate] Race on slot ${slot._id.toString()} for doctor ${doctorId.toString()}: already INVALIDATED (was ${expectedStatus} at read)`,
              );
              continue;
            }

            if (fresh.status === SlotStatus.BOOKED) {
              this.logger.warn(
                `[WorkingHoursUpdate] Race on slot ${slot._id.toString()} for doctor ${doctorId.toString()}: BOOKED between read and write (was ${expectedStatus} at read) — cancelling fresh booking`,
              );
              await this.cancelBookingForSlot(
                fresh._id,
                session,
                affectedBookings,
              );
            } else {
              this.logger.warn(
                `[WorkingHoursUpdate] Race on slot ${slot._id.toString()} for doctor ${doctorId.toString()}: status drifted ${expectedStatus} → ${fresh.status}`,
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
      await session.commitTransaction();

      // RC-7: invalidate AFTER commit and unconditionally. Pre-commit
      // invalidation lets a concurrent reader re-cache pre-update data
      // before the new state is visible. Conditional invalidation also
      // misses edits with no booked slots, leaving up to 2h of stale cache.
      const affectedPatientIds = [
        ...new Set(affectedBookings.map((b) => b.patientId)),
      ];
      await invalidateBookingCaches(
        this.cacheService,
        doctorId.toString(),
        affectedPatientIds.length > 0 ? affectedPatientIds : undefined,
        this.logger,
      );

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
          status: BookingStatus.NEEDS_RESCHEDULE,
          cancellation: {
            cancelledBy: 'SYSTEM',
            reason: 'Doctor updated working hours',
            cancelledAt: new Date(),
          },
        },
      },
      { session },
    );

    if (updateRes.modifiedCount === 0) {
      this.logger.log(
        `[WorkingHoursUpdate] Booking ${booking._id.toString()} already finalized, skipping cancellation+notification`,
      );
      return;
    }

    if (typeof booking.patientId !== 'string') {
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
