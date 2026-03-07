import { KAFKA_TOPICS } from '@app/common/kafka/events/topics';
import type {
  AdminApprovedPostEvent,
  AdminRejectedPostEvent,
  BookingCancelledNotificationEvent,
  BookingCancelledNotificationEventByUser,
  BookingCompletedNotificationEvent,
  BookingRescheduledNotificationEvent,
} from '@app/common/kafka/interfaces/kafka-event.interface';
import {
  Controller,
  Get,
  Post,
  Param,
  HttpCode,
  HttpStatus,
  Logger,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { EventPattern, Payload } from '@nestjs/microservices';
import { NotificationService } from './notification-service.service';
import { UserRole } from '@app/common/database/schemas/common.enums';
import { JwtAuthGuard } from '@app/common/guards/jwt.guard';
import { RolesGuard } from '@app/common/guards/role.guard';
import { Roles } from '@app/common/decorator/role.decorator';
import { ParseMongoIdPipe } from '@app/common/pipes/parse-mongo-id.pipe';

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

  @EventPattern(KAFKA_TOPICS.BOOKING_RESCHEDULED_NOTIFICATION)
  async handleBookingRescheduled(
    @Payload() event: BookingRescheduledNotificationEvent,
  ): Promise<void> {
    this.logger.log(
      `🎯 Received BOOKING_RESCHEDULED_NOTIFICATION event for patient ${event.data.patientName}`,
    );

    try {
      await this.notificationService.sendRescheduledNotificationToPatient(
        event,
      );
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

  @EventPattern(KAFKA_TOPICS.ADMIN_APPROVED_POST)
  async handleAdminApprovedPost(
    @Payload() event: AdminApprovedPostEvent,
  ): Promise<void> {
    this.logger.log(
      `🎯 Received ADMIN_APPROVED_POST event for post ${event.data.postId}`,
    );

    try {
      await this.notificationService.sendAdminApprovedPostNotification(event);
      this.logger.log(
        `✅ Successfully sent completion notification to Doctor ${event.data.doctorName}`,
      );
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `❌ Failed to process booking completion notification: ${err.message}`,
        err.stack,
      );
    }
  }

  @EventPattern(KAFKA_TOPICS.ADMIN_REJECTED_POST)
  async handleAdminRejectedPost(
    @Payload() event: AdminRejectedPostEvent,
  ): Promise<void> {
    this.logger.log(
      `🎯 Received ADMIN_REJECTED_POST event for post ${event.data.postId}`,
    );

    try {
      await this.notificationService.sendAdminRejectedPostNotification(event);
      this.logger.log(
        `✅ Successfully sent rejection notification to Doctor ${event.data.doctorName}`,
      );
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `❌ Failed to process rejection notification: ${err.message}`,
        err.stack,
      );
    }
  }

  /**
   * Get unread notifications for a user
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.USER, UserRole.DOCTOR)
  @Get('unread')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get unread notifications',
    description:
      'Returns all unread notifications for a specific user (patient or doctor)',
  })
  async getUnreadNotifications(@Req() req: any) {
    const recipientId = new ParseMongoIdPipe().transform(
      req.user.entity._id.toString(),
    );
    const recipientType = req.user.role as UserRole;
    return this.notificationService.getUnreadNotifications(
      recipientId,
      recipientType,
    );
  }

  /**
   * Get unread count
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.USER, UserRole.DOCTOR)
  @Get('unread-count')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get unread notification count',
    description: 'Returns count of unread notifications (for badge)',
  })
  async getUnreadCount(@Req() req: any) {
    const recipientId = new ParseMongoIdPipe().transform(
      req.user.entity._id.toString(),
    );
    const recipientType = req.user.role as UserRole;
    const count = await this.notificationService.getUnreadCount(
      recipientId,
      recipientType,
    );
    return { count };
  }

  /**
   * Mark notification as read
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.USER, UserRole.DOCTOR)
  @Post('read')
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
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.USER, UserRole.DOCTOR)
  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Mark all notifications as read',
    description: 'Marks all unread notifications as read for a user',
  })
  @ApiResponse({
    status: 200,
    description: 'All notifications marked as read',
  })
  async markAllAsRead(@Req() req: any) {
    const recipientId = new ParseMongoIdPipe().transform(
      req.user.entity._id.toString(),
    );
    const recipientType = req.user.role as UserRole;
    await this.notificationService.markAllAsRead(recipientId, recipientType);
    return { message: 'All notifications marked as read' };
  }
}
