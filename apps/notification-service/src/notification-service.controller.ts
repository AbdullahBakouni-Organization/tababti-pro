import { KAFKA_TOPICS } from '@app/common/kafka/events/topics';
import type {
  BookingCancelledNotificationEvent,
  BookingCancelledNotificationEventByUser,
  BookingCompletedNotificationEvent,
} from '@app/common/kafka/interfaces/kafka-event.interface';
import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { EventPattern, Payload } from '@nestjs/microservices';
import { NotificationService } from './notification-service.service';
import { UserRole } from '@app/common/database/schemas/common.enums';

@ApiTags('Notifications')
@Controller('notifications')
export class NotificationServiceController {
  private readonly logger = new Logger(NotificationServiceController.name);
  constructor(private readonly notificationService: NotificationService) {}

  @EventPattern(KAFKA_TOPICS.BOOKING_CANCELLED_NOTIFICATION)
  async handleBookingCancelledNotification(
    @Payload() event: BookingCancelledNotificationEvent,
  ): Promise<void> {
    this.logger.log(`🎯 send notification to ${event.data.patientId}`);

    try {
      await this.notificationService.sendCancelledNotification(event);
      this.logger.log(
        `✅ Successfully send notification to ${event.data.patientId}`,
      );
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `❌ Failed to process slot generation: ${err.message}`,
        err.stack,
      );
    }
  }

  @EventPattern(KAFKA_TOPICS.BOOKING_CANCELLED_BY_USER)
  async handleBookingCancelledNotificationByUser(
    @Payload() event: BookingCancelledNotificationEventByUser,
  ): Promise<void> {
    this.logger.log(`🎯 send notification to ${event.data.doctorName}`);

    try {
      await this.notificationService.sendCancelledNotificationToDoctor(event);
      this.logger.log(
        `✅ Successfully send notification to ${event.data.doctorName}`,
      );
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `❌ Failed to process slot generation: ${err.message}`,
        err.stack,
      );
    }
  }
  @EventPattern(KAFKA_TOPICS.BOOKING_COMPLETED)
  async handleBookingCompleted(
    @Payload() event: BookingCompletedNotificationEvent,
  ): Promise<void> {
    this.logger.log(
      `🎯 Received BOOKING_COMPLETED_NOTIFICATION event for patient ${event.data.patientName}`,
    );

    try {
      await this.notificationService.sendCompletedNotificationToPatient(event);
      this.logger.log(
        `✅ Successfully sent completion notification to patient ${event.data.patientName}`,
      );
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `❌ Failed to process booking completion notification: ${err.message}`,
        err.stack,
      );
    }
  }
  /**
   * Get unread notifications for a user
   */
  @Get(':recipientId/unread')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get unread notifications',
    description:
      'Returns all unread notifications for a specific user (patient or doctor)',
  })
  @ApiQuery({
    name: 'recipientType',
    enum: UserRole,
    required: true,
    description: 'Type of recipient (USER for patient, DOCTOR for doctor)',
  })
  @ApiResponse({
    status: 200,
    description: 'Unread notifications retrieved',
  })
  async getUnreadNotifications(
    @Param('recipientId') recipientId: string,
    @Query('recipientType') recipientType: UserRole,
  ) {
    return this.notificationService.getUnreadNotifications(
      recipientId,
      recipientType,
    );
  }

  /**
   * Get unread count
   */
  @Get(':recipientId/unread-count')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get unread notification count',
    description: 'Returns count of unread notifications (for badge)',
  })
  @ApiQuery({
    name: 'recipientType',
    enum: UserRole,
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: 'Count retrieved',
  })
  async getUnreadCount(
    @Param('recipientId') recipientId: string,
    @Query('recipientType') recipientType: UserRole,
  ) {
    const count = await this.notificationService.getUnreadCount(
      recipientId,
      recipientType,
    );
    return { count };
  }

  /**
   * Mark notification as read
   */
  @Post(':notificationId/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Mark notification as read',
    description: 'Marks a single notification as read',
  })
  @ApiResponse({
    status: 200,
    description: 'Notification marked as read',
  })
  async markAsRead(@Param('notificationId') notificationId: string) {
    await this.notificationService.markAsRead(notificationId);
    return { message: 'Notification marked as read' };
  }

  /**
   * Mark all notifications as read
   */
  @Post(':recipientId/read-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Mark all notifications as read',
    description: 'Marks all unread notifications as read for a user',
  })
  @ApiQuery({
    name: 'recipientType',
    enum: UserRole,
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: 'All notifications marked as read',
  })
  async markAllAsRead(
    @Param('recipientId') recipientId: string,
    @Query('recipientType') recipientType: UserRole,
  ) {
    await this.notificationService.markAllAsRead(recipientId, recipientType);
    return { message: 'All notifications marked as read' };
  }
}
