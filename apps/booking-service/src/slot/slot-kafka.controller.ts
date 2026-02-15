import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { SlotGenerationService } from './slot.service';
import { KAFKA_TOPICS } from '@app/common/kafka/events/topics';
import type {
  SlotGenerationEvent,
  SlotGenerationFutureEvent,
  SlotGenerationTodayEvent,
  SlotRefreshedEvent,
} from '@app/common/kafka/interfaces/kafka-event.interface';
import { GetAvailableSlotsDto } from './dto/get-avalible-slot.dto';

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

  @EventPattern(KAFKA_TOPICS.SLOTS_GENERATE_FOR_TODAY)
  async handleSlotGenerationEventToday(
    @Payload() event: SlotGenerationTodayEvent,
  ): Promise<void> {
    this.logger.log(
      `🎯 Received SLOTS_GENERATE_TODAY event for doctor ${event.data.doctorInfo.fullName}`,
    );

    try {
      await this.slotGenerationService.processSlotGenerationForToday(event);
      this.logger.log(
        `✅ Successfully processed slot generation for doctor ${event.data.doctorInfo.fullName}`,
      );
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `❌ Failed to process slot generation: ${err.message}`,
        err.stack,
      );
    }
  }

  @EventPattern(KAFKA_TOPICS.SLOTS_GENERATE_FOR_FUTURE)
  async handleSlotGenerationEventFuture(
    @Payload() event: SlotGenerationFutureEvent,
  ): Promise<void> {
    this.logger.log(
      `🎯 Received SLOTS_GENERATE_TODAY event for doctor ${event.data.doctorInfo.fullName}`,
    );

    try {
      await this.slotGenerationService.processSlotGenerationFor(event);
      this.logger.log(
        `✅ Successfully processed slot generation for doctor ${event.data.doctorInfo.fullName}`,
      );
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `❌ Failed to process slot generation: ${err.message}`,
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

    //   const freshSlots =
    //     await this.slotGenerationService.getAvailableSlots(query);

    //   // Now DO something with freshSlots
    //
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
}
