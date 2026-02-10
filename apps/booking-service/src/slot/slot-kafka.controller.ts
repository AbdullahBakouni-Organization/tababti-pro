import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { SlotGenerationService } from './slot.service';
import { KAFKA_TOPICS } from '@app/common/kafka/events/topics';
import type { SlotGenerationEvent } from '@app/common/kafka/interfaces/kafka-event.interface';

@Controller() // ← Must be a Controller!
export class SlotKafkaController {
  private readonly logger = new Logger(SlotKafkaController.name);

  constructor(private readonly slotGenerationService: SlotGenerationService) {}

  @EventPattern(KAFKA_TOPICS.SLOTS_GENERATE)
  async handleSlotGenerationEvent(
    @Payload() event: SlotGenerationEvent,
  ): Promise<void> {
    this.logger.log(
      `🎯 Received SLOTS_GENERATE event for doctor ${event.data.doctorId}`,
    );

    try {
      await this.slotGenerationService.processSlotGeneration(event);
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
