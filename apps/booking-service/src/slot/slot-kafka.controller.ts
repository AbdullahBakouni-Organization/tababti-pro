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
  ) {}

  @EventPattern(KAFKA_TOPICS.INSPECTION_DURATION_CHANGED)
  async handleInspectionDurationChanged(
    @Payload() event: InspectionDurationChangedEvent,
  ) {
    this.logger.log(
      `🎯 Received INSPECTION_DURATION_CHANGED for doctor ${event.doctorId} (${event.oldInspectionDuration} → ${event.newInspectionDuration})`,
    );
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
    }
  }

  @EventPattern(KAFKA_TOPICS.WORKING_HOURS_DELETED)
  async handleWorkingHoursDeleted(@Payload() event: WorkingHoursDeletedEvent) {
    this.logger.log(
      `🎯 Received WORKING_HOURS_DELETED for doctor ${event.doctorId}`,
    );
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
    }
  }

  @EventPattern(KAFKA_TOPICS.SLOTS_GENERATE)
  async handleSlotGenerationEvent(
    @Payload() event: SlotGenerationEvent,
  ): Promise<void> {
    this.logger.log(
      `🎯 Received SLOTS_GENERATE event for doctor ${event.data.doctorId}`,
    );
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
    }
  }
}
