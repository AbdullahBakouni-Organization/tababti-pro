import { KAFKA_TOPICS } from '@app/common/kafka/events/topics';
import type { BookingCancelledNotificationEvent } from '@app/common/kafka/interfaces/kafka-event.interface';
import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { ApiTags } from '@nestjs/swagger';
import { NotificationService } from './notification-service.service';

@ApiTags('Notifications')
@Controller('notifications')
export class NotificationServiceController {
  private readonly logger = new Logger(NotificationServiceController.name);
  constructor(private readonly notificationService: NotificationService) {}
  @EventPattern(KAFKA_TOPICS.BOOKING_CANCELLED_NOTIFICATION)
  async handleBookingCancelledNotification(
    @Payload() event: BookingCancelledNotificationEvent,
  ): Promise<void> {
    this.logger.log(`🎯 send notification to ${event.data.patientName}`);

    try {
      await this.notificationService.sendCancelledNotification(event);
      this.logger.log(
        `✅ Successfully send notification to ${event.data.patientName}`,
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
