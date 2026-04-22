import { InjectQueue, Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job, Queue } from 'bull';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  AppointmentSlot,
  AppointmentSlotDocument,
} from '@app/common/database/schemas/slot.schema';
import {
  SlotStatus,
  Days,
  WorkigEntity,
} from '@app/common/database/schemas/common.enums';
import {
  Doctor,
  DoctorDocument,
} from '@app/common/database/schemas/doctor.schema';
import { SlotGenerationEvent } from '@app/common/kafka/interfaces/kafka-event.interface'; // adjust path
import { getSyriaDate } from '@app/common/utils/get-syria-date'; // adjust path
import { CacheService } from '@app/common/cache/cache.service';

export interface SlotGenerationJobData {
  eventType: 'SLOTS_GENERATE';
  timestamp: string | Date;
  doctorId: string;
  WorkingHours: Array<{
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
  inspectionPrice?: number;
  doctorInfo: {
    fullName: string;
    [key: string]: any;
  };
}

@Processor('WORKING_HOURS_GENERATE')
export class SlotGenerationProcessor {
  private readonly logger = new Logger(SlotGenerationProcessor.name);

  // How many weeks ahead to generate slots — keep same as your original service
  private readonly SLOT_GENERATION_WEEKS = 48;

  // Phase 1 covers today + the next 13 days (weeks 0-1). Phase 2 runs
  // weeks 2..SLOT_GENERATION_WEEKS in a follow-up job so the Kafka handler
  // responds to the doctor in sub-second time.
  private readonly PHASE1_WEEKS = 2;

  constructor(
    @InjectModel(AppointmentSlot.name)
    private slotModel: Model<AppointmentSlotDocument>,
    @InjectModel(Doctor.name) private doctorModel: Model<DoctorDocument>,
    private readonly cacheService: CacheService,
    @InjectQueue('WORKING_HOURS_GENERATE')
    private readonly selfQueue: Queue,
  ) {
    this.logger.log(`[Slot Generation Job] Processing for doctor`);
  }

  /* -------------------------------------------------------------------------- */
  /*                              BULL JOB HANDLER                               */
  /* -------------------------------------------------------------------------- */

  @Process('PROCESS_WORKING_HOURS_GENERATE')
  async handleSlotGeneration(job: Job<SlotGenerationJobData>): Promise<void> {
    await this.runGenerationPhase(job, {
      phaseLabel: 'Phase 1',
      lockSuffix: '',
      startWeek: 0,
      endWeek: this.PHASE1_WEEKS,
      dispatchPhase2: true,
    });
  }

  @Process('PROCESS_WORKING_HOURS_GENERATE_PHASE2')
  async handleSlotGenerationPhase2(
    job: Job<SlotGenerationJobData>,
  ): Promise<void> {
    // RC-6 (FIX 6): Phase 2 staleness check. The SlotGenerationEvent does
    // not carry a `version` field, so we fall back to comparing
    // Doctor.updatedAt against the job timestamp baked in at publish time.
    // Caveat: any unrelated Doctor write (rating bump, profile edit) also
    // moves `updatedAt`, which can cause a false-positive skip. The user
    // accepted this trade-off vs adding a schema field — losing a
    // backfill is recoverable; corrupting fresh slots from the newer
    // event is not.
    // Staleness-skip leaves the `phase2:running` key intact so the newer
    // Phase 2 (which owns the key) can still signal the frontend.
    if (await this.isPhase2Stale(job)) return;

    try {
      await this.runGenerationPhase(job, {
        phaseLabel: 'Phase 2',
        lockSuffix: ':backfill',
        startWeek: this.PHASE1_WEEKS,
        endWeek: this.SLOT_GENERATION_WEEKS,
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
    job: Job<SlotGenerationJobData>,
  ): Promise<boolean> {
    const { doctorId, timestamp } = job.data;
    const doctor = await this.doctorModel
      .findById(doctorId)
      .select('updatedAt')
      .lean()
      .exec();
    if (!doctor) {
      this.logger.warn(
        `[SlotGeneration] Phase 2 staleness: doctor=${doctorId} not found — skipping`,
      );
      return true;
    }
    const doctorUpdatedAt = (doctor as any).updatedAt
      ? new Date((doctor as any).updatedAt).getTime()
      : 0;
    const jobTimestamp = new Date(timestamp).getTime();
    if (doctorUpdatedAt > jobTimestamp) {
      this.logger.warn(
        `[SlotGeneration] Phase 2 stale for doctor=${doctorId}: doctor.updatedAt=${new Date(doctorUpdatedAt).toISOString()} > job.timestamp=${new Date(jobTimestamp).toISOString()} — newer Phase 1 will dispatch a fresh Phase 2; skipping`,
      );
      return true;
    }
    return false;
  }

  private async runGenerationPhase(
    job: Job<SlotGenerationJobData>,
    opts: {
      phaseLabel: string;
      lockSuffix: string;
      startWeek: number;
      endWeek: number;
      dispatchPhase2: boolean;
    },
  ): Promise<void> {
    const { doctorId, WorkingHours } = job.data;
    const { phaseLabel, lockSuffix, startWeek, endWeek, dispatchPhase2 } = opts;

    this.logger.log(
      `[Slot Generation Job ${phaseLabel}] Processing for doctor ${doctorId} | Job ID: ${job.id}`,
    );

    await job.progress(0);

    // Idempotency: browser retries republish the same Kafka event, so the
    // create-working-hours event may fire multiple times. A per-(doctor, day)
    // Redis lock absorbs duplicates while the first job is in-flight. The
    // locks are released in `finally` so legitimate follow-up edits after
    // the job completes aren't silently dropped by the TTL window. Phase 2
    // uses a `:backfill` suffix so it doesn't collide with Phase 1 locks.
    const uniqueDays = Array.from(new Set(WorkingHours.map((wh) => wh.day)));

    const lockedDays: Array<{ day: Days; token: string }> = [];
    for (const day of uniqueDays) {
      const lockKey = `lock:working_hours_create:${doctorId}:${day}${lockSuffix}`;
      const lockToken = await this.cacheService.acquireLock(lockKey, 300);
      if (lockToken === null) {
        // Redis is unreachable — release whatever we already acquired and
        // throw so Bull retries the whole job. Silently skipping would
        // drop the doctor's edit forever.
        for (const held of lockedDays) {
          const heldKey = `lock:working_hours_create:${doctorId}:${held.day}${lockSuffix}`;
          await this.cacheService.releaseLock(heldKey, held.token);
        }
        throw new Error(
          `Redis unavailable acquiring ${lockKey} — Bull will retry`,
        );
      }
      if (lockToken === false) {
        this.logger.warn(
          `Skipped PROCESS_WORKING_HOURS_GENERATE (${phaseLabel}) for doctor=${doctorId} day=${day}: lock ${lockKey} held by concurrent job`,
        );
        continue;
      }
      lockedDays.push({ day, token: lockToken });
    }

    if (lockedDays.length === 0) {
      this.logger.warn(
        `[Slot Generation Job ${phaseLabel}] No days acquired for doctor ${doctorId} — all locks held. Skipping entire job.`,
      );
      await job.progress(100);
      // Concurrent Phase 1 run will dispatch its own Phase 2; skip here.
      return;
    }

    // RC-3 (FIX 3): cross-op outer lock shared with delete/update/inspection
    // so only one slot-affecting op runs per (doctor, phase) at a time.
    // Acquire AFTER all per-day locks (so per-day dedup happens first); on
    // contention, release every per-day lock and throw so Bull retries —
    // skipping would silently drop the doctor's create when an inspection-
    // duration job (which rewrites every day) is mid-flight. Released first
    // in finally so the inner per-day locks are released last.
    const allLockKey = `lock:doctor:${doctorId}:ALL${lockSuffix}`;
    const allLockToken = await this.cacheService.acquireLock(allLockKey, 300);
    if (allLockToken === null || allLockToken === false) {
      for (const held of lockedDays) {
        const heldKey = `lock:working_hours_create:${doctorId}:${held.day}${lockSuffix}`;
        await this.cacheService.releaseLock(heldKey, held.token);
      }
      if (allLockToken === null) {
        throw new Error(
          `Redis unavailable acquiring ${allLockKey} — Bull will retry`,
        );
      }
      this.logger.warn(
        `Contended ${allLockKey} for PROCESS_WORKING_HOURS_GENERATE (${phaseLabel}) doctor=${doctorId} — throwing for Bull retry (cross-op coord)`,
      );
      throw new Error(
        `Cross-op lock ${allLockKey} held — Bull will retry to coordinate with concurrent slot-affecting job`,
      );
    }

    try {
      // Build a SlotGenerationEvent-like shape from the job data,
      // scoped to only the days this job actually owns a lock for.
      const lockedDayNames = lockedDays.map((d) => d.day);
      const scopedWorkingHours = WorkingHours.filter((wh) =>
        lockedDayNames.includes(wh.day),
      );

      const event: SlotGenerationEvent = {
        eventType: job.data.eventType,
        timestamp: new Date(job.data.timestamp),
        data: {
          doctorId: job.data.doctorId,
          WorkingHours: scopedWorkingHours,
          inspectionDuration: job.data.inspectionDuration,
          inspectionPrice: job.data.inspectionPrice,
          doctorInfo: job.data.doctorInfo,
        },
      };

      await job.progress(10);

      const slots = await this.generateSlots(event, startWeek, endWeek);

      await job.progress(80);

      this.logger.log(
        `[Slot Generation Job ${phaseLabel}] Generated ${slots.length} slots for doctor ${doctorId}`,
      );

      await job.progress(100);

      this.logger.log(
        `[Slot Generation Job ${phaseLabel}] ✅ Completed for doctor ${doctorId}`,
      );
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `[Slot Generation Job ${phaseLabel}] ❌ Failed for doctor ${doctorId}: ${err.message}`,
        err.stack,
      );
      // Re-throw so Bull marks the job as failed and triggers retries
      throw error;
    } finally {
      // Release outer `:ALL` lock first, then per-day locks (reverse acquire order).
      await this.cacheService.releaseLock(allLockKey, allLockToken);
      for (const held of lockedDays) {
        const lockKey = `lock:working_hours_create:${doctorId}:${held.day}${lockSuffix}`;
        await this.cacheService.releaseLock(lockKey, held.token);
      }
    }

    if (dispatchPhase2) this.dispatchPhase2(job);
  }

  // Fire-and-forget enqueue. A failure here must never rollback Phase 1:
  // the immediate slots are already committed. We log loudly so an ops
  // alert can pick up systemic Bull/Redis outages, but we never throw.
  // After a successful enqueue we set `phase2:running:<doctorId>` so the
  // frontend polling endpoint can report progress; a SET failure is logged
  // as a warning but never throws (the frontend tolerates stale state).
  private dispatchPhase2(job: Job<SlotGenerationJobData>): void {
    const doctorId = job.data.doctorId;
    this.selfQueue
      .add('PROCESS_WORKING_HOURS_GENERATE_PHASE2', job.data)
      .then(() => {
        this.logger.log(
          `[Slot Generation Job] Phase 2 backfill dispatched for doctor ${doctorId}`,
        );
        return this.cacheService
          .set(
            `phase2:running:${doctorId}`,
            JSON.stringify({
              operation: 'create',
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
          `[Slot Generation Job] ❌ Failed to dispatch Phase 2 backfill for doctor ${doctorId}: ${err.message}`,
          err.stack,
        );
      });
  }

  /* -------------------------------------------------------------------------- */
  /*                          UNCHANGED CORE LOGIC                               */
  /* -------------------------------------------------------------------------- */

  private async generateSlots(
    event: SlotGenerationEvent,
    startWeek: number,
    endWeek: number,
  ): Promise<AppointmentSlot[]> {
    const {
      doctorId,
      WorkingHours,
      inspectionDuration,
      inspectionPrice,
      doctorInfo,
    } = event.data;

    const slots: Partial<AppointmentSlot>[] = [];
    const today = getSyriaDate();

    for (let week = startWeek; week < endWeek; week++) {
      for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
        const currentDate = new Date(today);
        currentDate.setDate(today.getDate() + week * 7 + dayOffset);

        // ✅ Always calculate day from the SAME date object
        const dayOfWeek = this.getDayName(currentDate.getUTCDay());

        const dayWorkingHours = WorkingHours.filter(
          (wh) => wh.day.toLowerCase() === dayOfWeek.toLowerCase(),
        );

        const doctorObjectId = new Types.ObjectId(doctorId);

        for (const wh of dayWorkingHours) {
          slots.push(
            ...this.generateSlotsForDay(
              doctorObjectId,
              currentDate,
              dayOfWeek as Days,
              wh.startTime,
              wh.endTime,
              inspectionDuration,
              wh.location,
              inspectionPrice,
              doctorInfo,
            ),
          );
        }
      }
    }

    const createdSlots = await this.batchInsertSlots(slots);

    return createdSlots;
  }

  /* -------------------------------------------------------------------------- */
  /*                          DAILY SLOT GENERATION                              */
  /* -------------------------------------------------------------------------- */

  private generateSlotsForDay(
    doctorId: Types.ObjectId,
    date: Date,
    dayOfWeek: Days,
    startTime: string,
    endTime: string,
    duration: number,
    location: any,
    price: number | undefined,
    doctorInfo: any,
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

      // ✅ Date is normalized and UTC-safe
      const slotDate = new Date(date);
      slotDate.setUTCHours(0, 0, 0, 0);

      slots.push({
        doctorId: doctorId,
        status: SlotStatus.AVAILABLE,
        date: slotDate,
        startTime: `${String(slotStartHour).padStart(2, '0')}:${String(
          slotStartMin,
        ).padStart(2, '0')}`,
        endTime: `${String(slotEndHour).padStart(2, '0')}:${String(
          slotEndMin,
        ).padStart(2, '0')}`,
        dayOfWeek,
        duration,
        price,
        location,
        doctorInfo: {
          fullName: doctorInfo.fullName,
        },
        isRecurring: true,
        workingHoursVersion: 0,
      });

      currentMinutes += duration;
    }

    return slots;
  }

  /* -------------------------------------------------------------------------- */
  /*                              BATCH INSERT                                   */
  /* -------------------------------------------------------------------------- */

  private async batchInsertSlots(
    slots: Partial<AppointmentSlot>[],
  ): Promise<AppointmentSlot[]> {
    if (slots.length === 0) return [];

    const BATCH_SIZE = 100;
    const createdSlots: AppointmentSlot[] = [];

    for (let i = 0; i < slots.length; i += BATCH_SIZE) {
      const batch = slots.slice(i, i + BATCH_SIZE);
      try {
        const inserted = await this.slotModel.insertMany(batch, {
          ordered: false, // continue on duplicate key errors
        });
        createdSlots.push(...(inserted as unknown as AppointmentSlot[]));
      } catch (error: any) {
        // Ignore duplicate key errors (code 11000), re-throw others
        if (error?.code !== 11000) {
          throw error;
        }
        this.logger.warn(
          `[Slot Generation] Skipped duplicate slots in batch ${i / BATCH_SIZE + 1}`,
        );
      }
    }

    return createdSlots;
  }

  /* -------------------------------------------------------------------------- */
  /*                              HELPERS                                        */
  /* -------------------------------------------------------------------------- */

  private getDayName(utcDay: number): string {
    const days = [
      'sunday',
      'monday',
      'tuesday',
      'wednesday',
      'thursday',
      'friday',
      'saturday',
    ];
    return days[utcDay];
  }
}
