import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { SlotGenerationService } from './slot.service';
import { KAFKA_TOPICS } from '@app/common/kafka/events/topics';
import type {
  InspectionDurationChangedEvent,
  SlotGenerationEvent,
  SlotRefreshedEvent,
  WorkingHoursDeletedEvent,
  WorkingHoursUpdatedEvent,
} from '@app/common/kafka/interfaces/kafka-event.interface';
import { GetAvailableSlotsDto } from './dto/get-avalible-slot.dto';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { CacheService } from '@app/common/cache/cache.service';

// Event-level idempotency window. Long enough to absorb double-clicks and
// frontend retries; short enough that a deliberate re-edit ~1 minute later
// is not blocked.
const EVENT_LOCK_TTL_SECONDS = 30;

@Controller()
export class SlotKafkaController {
  private readonly logger = new Logger(SlotKafkaController.name);

  constructor(
    private readonly slotGenerationService: SlotGenerationService,
    @InjectQueue('WORKING_HOURS_UPDATE')
    private workingHoursQueue: Queue,

    @InjectQueue('WORKING_HOURS_GENERATE')
    private workingHoursQueue_V1: Queue,

    @InjectQueue('WORKING_HOURS_DELETE')
    private workingHoursDeleteQueue: Queue,

    @InjectQueue('INSPECTION_DURATION_UPDATE')
    private inspectionDurationQueue: Queue,

    private readonly cacheService: CacheService,
  ) {}

  // Acquires N event-locks (one per day). Returns:
  //   { tokens: Map<key, token> } when at least one lock was acquired and we
  //     should proceed with the enqueue. Caller MUST releaseEventLocks().
  //   null when Redis is down (caller should throw to let Kafka retry).
  //   false when EVERY lock was contended (true duplicate — caller skips).
  private async acquireEventLocks(
    keys: string[],
  ): Promise<{ tokens: Map<string, string> } | null | false> {
    const tokens = new Map<string, string>();
    for (const key of keys) {
      const token = await this.cacheService.acquireLock(
        key,
        EVENT_LOCK_TTL_SECONDS,
      );
      if (token === null) {
        // Redis down mid-acquire — release whatever we already grabbed.
        await this.releaseEventLocks(tokens);
        return null;
      }
      if (token === false) continue;
      tokens.set(key, token);
    }
    if (tokens.size === 0) return false;
    return { tokens };
  }

  private async releaseEventLocks(tokens: Map<string, string>): Promise<void> {
    for (const [key, token] of tokens) {
      await this.cacheService.releaseLock(key, token);
    }
  }

  @EventPattern(KAFKA_TOPICS.INSPECTION_DURATION_CHANGED)
  async handleInspectionDurationChanged(
    @Payload() event: InspectionDurationChangedEvent,
  ) {
    this.logger.log(
      `🎯 Received INSPECTION_DURATION_CHANGED for doctor ${event.doctorId} (${event.oldInspectionDuration} → ${event.newInspectionDuration})`,
    );

    const lockKey = `lock:kafka_event:inspection:${event.doctorId}`;
    const result = await this.acquireEventLocks([lockKey]);

    if (result === null) {
      this.logger.error(
        `Redis unavailable for event lock ${lockKey} — Kafka will retry`,
      );
      throw new Error('Redis unavailable');
    }
    if (result === false) {
      this.logger.warn(
        `Duplicate Kafka event ignored — INSPECTION_DURATION_CHANGED for doctor ${event.doctorId} already queued within ${EVENT_LOCK_TTL_SECONDS}s`,
      );
      return;
    }

    try {
      await this.inspectionDurationQueue.add(
        'PROCESS_INSPECTION_DURATION_UPDATE',
        {
          doctorId: event.doctorId,
          oldInspectionDuration: event.oldInspectionDuration,
          newInspectionDuration: event.newInspectionDuration,
          inspectionPrice: event.inspectionPrice,
          workingHours: event.workingHours,
          doctorInfo: event.doctorInfo,
          version: event.version,
        },
      );
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `❌ Failed to enqueue inspection duration update: ${err.message}`,
        err.stack,
      );
    } finally {
      await this.releaseEventLocks(result.tokens);
    }
  }

  @EventPattern(KAFKA_TOPICS.WORKING_HOURS_DELETED)
  async handleWorkingHoursDeleted(@Payload() event: WorkingHoursDeletedEvent) {
    this.logger.log(
      `🎯 Received WORKING_HOURS_DELETED for doctor ${event.doctorId}`,
    );

    const day = event.deletedWorkingHour?.day;
    const lockKey = `lock:kafka_event:wh_delete:${event.doctorId}:${day}`;
    const result = await this.acquireEventLocks([lockKey]);

    if (result === null) {
      this.logger.error(
        `Redis unavailable for event lock ${lockKey} — Kafka will retry`,
      );
      throw new Error('Redis unavailable');
    }
    if (result === false) {
      this.logger.warn(
        `Duplicate Kafka event ignored — WORKING_HOURS_DELETED for doctor ${event.doctorId} day ${day} already queued within ${EVENT_LOCK_TTL_SECONDS}s`,
      );
      return;
    }

    try {
      await this.workingHoursDeleteQueue.add('PROCESS_WORKING_HOURS_DELETE', {
        doctorId: event.doctorId,
        deletedWorkingHour: event.deletedWorkingHour,
        version: event.version,
      });
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `❌ Failed to enqueue working hours delete: ${err.message}`,
        err.stack,
      );
    } finally {
      await this.releaseEventLocks(result.tokens);
    }
  }

  @EventPattern(KAFKA_TOPICS.SLOTS_REFRESHED)
  async handleSlotsRefreshed(@Payload() event: SlotRefreshedEvent) {
    const doctorId = event.data.doctorId;
    this.logger.log(
      `🎯 Received SLOTS_REFRESHED event for doctor location ${event.data.location}`,
    );
    const query: GetAvailableSlotsDto = {
      doctorId,
    };
    try {
      await this.slotGenerationService.getAvailableSlots(query);
      this.logger.log(`✅ Successfully refreshed slots for doctor`);
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `❌ Failed to process slot generation: ${err.message}`,
        err.stack,
      );
    }
  }

  @EventPattern(KAFKA_TOPICS.WORKING_HOURS_UPDATED)
  async handleWorkingHoursUpdated(@Payload() event: WorkingHoursUpdatedEvent) {
    this.logger.log(`🎯 Received WORKING_HOURS_UPDATED event for doctor`);

    const days = event.updatedDays ?? [];
    const lockKeys = days.map(
      (day) => `lock:kafka_event:wh_update:${event.doctorId}:${day}`,
    );
    // Empty updatedDays — degenerate event, fall through without locking
    // (existing processor handles its own no-op; matches prior behavior).
    const result =
      lockKeys.length > 0 ? await this.acquireEventLocks(lockKeys) : null;

    if (lockKeys.length > 0 && result === null) {
      this.logger.error(
        `Redis unavailable for event locks (wh_update doctor=${event.doctorId}) — Kafka will retry`,
      );
      throw new Error('Redis unavailable');
    }
    if (lockKeys.length > 0 && result === false) {
      this.logger.warn(
        `Duplicate Kafka event ignored — WORKING_HOURS_UPDATED for doctor ${event.doctorId} days [${days.join(',')}] already queued within ${EVENT_LOCK_TTL_SECONDS}s`,
      );
      return;
    }

    try {
      await this.workingHoursQueue.add('PROCESS_WORKING_HOURS_UPDATE', {
        doctorId: event.doctorId,
        oldWorkingHours: event.oldWorkingHours,
        newWorkingHours: event.newWorkingHours,
        updatedDays: event.updatedDays,
        version: event.version,
        inspectionDuration: event.inspectionDuration,
        inspectionPrice: event.inspectionPrice,
      });
      this.logger.log(`✅ Successfully processed working hours update`);
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `❌ Failed to process slot generation: ${err.message}`,
        err.stack,
      );
    } finally {
      if (result && typeof result === 'object') {
        await this.releaseEventLocks(result.tokens);
      }
    }
  }

  @EventPattern(KAFKA_TOPICS.SLOTS_GENERATE)
  async handleSlotGenerationEvent(
    @Payload() event: SlotGenerationEvent,
  ): Promise<void> {
    this.logger.log(
      `🎯 Received SLOTS_GENERATE event for doctor ${event.data.doctorId}`,
    );

    const days = (event.data.WorkingHours ?? []).map((wh) => wh.day);
    const lockKeys = days.map(
      (day) => `lock:kafka_event:wh_create:${event.data.doctorId}:${day}`,
    );
    const result =
      lockKeys.length > 0 ? await this.acquireEventLocks(lockKeys) : null;

    if (lockKeys.length > 0 && result === null) {
      this.logger.error(
        `Redis unavailable for event locks (wh_create doctor=${event.data.doctorId}) — Kafka will retry`,
      );
      throw new Error('Redis unavailable');
    }
    if (lockKeys.length > 0 && result === false) {
      this.logger.warn(
        `Duplicate Kafka event ignored — SLOTS_GENERATE for doctor ${event.data.doctorId} days [${days.join(',')}] already queued within ${EVENT_LOCK_TTL_SECONDS}s`,
      );
      return;
    }

    try {
      await this.workingHoursQueue_V1.add('PROCESS_WORKING_HOURS_GENERATE', {
        eventType: event.eventType,
        timestamp: event.timestamp,
        doctorId: event.data.doctorId,
        WorkingHours: event.data.WorkingHours,
        inspectionDuration: event.data.inspectionDuration,
        inspectionPrice: event.data.inspectionPrice,
        doctorInfo: event.data.doctorInfo,
      });
      this.logger.log(
        `✅ Successfully processed slot generation for doctor ${event.data.doctorId}`,
      );
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `❌ Failed to process slot generation: ${err.message}`,
        err.stack,
      );
    } finally {
      if (result && typeof result === 'object') {
        await this.releaseEventLocks(result.tokens);
      }
    }
  }
}
