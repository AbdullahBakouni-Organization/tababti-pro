import {
  BookingCancelledNotificationEvent,
  BookingCancelledNotificationEventByUser,
} from '@app/common/kafka/interfaces/kafka-event.interface';
import { Injectable, Logger } from '@nestjs/common';
import { FcmService } from 'apps/home-service/src/fcm/fcm.service';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(private readonly fcmService: FcmService) {}

  async sendCancelledNotification(
    event: BookingCancelledNotificationEvent,
  ): Promise<void> {
    try {
      const sent = await this.fcmService.sendBookingCancellationNotification(
        event.data.fcmToken,
        event.data,
      );

      if (sent) {
        this.logger.log(
          `FCM notification sent for booking ${event.data.bookingId}`,
        );
      } else {
        this.logger.warn(
          `Failed to send FCM notification for booking ${event.data.bookingId}`,
        );
      }
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `Error sending FCM notification: ${err.message}`,
        err.stack,
      );
    }
  }

  async sendCancelledNotificationToDoctor(
    event: BookingCancelledNotificationEventByUser,
  ): Promise<void> {
    try {
      const sent =
        await this.fcmService.sendBookingCancellationNotificationToDoctor(
          event.data.fcmToken,
          event.data,
        );

      if (sent) {
        this.logger.log(
          `FCM notification sent for booking ${event.data.bookingId}`,
        );
      } else {
        this.logger.warn(
          `Failed to send FCM notification for booking ${event.data.bookingId}`,
        );
      }
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `Error sending FCM notification: ${err.message}`,
        err.stack,
      );
    }
  }
}
