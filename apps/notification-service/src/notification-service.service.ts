import {
  NotificationStatus,
  NotificationTypes,
  UserRole,
} from '@app/common/database/schemas/common.enums';
import {
  Notification,
  NotificationDocument,
} from '@app/common/database/schemas/notification.schema';
import {
  BookingCancelledNotificationEvent,
  BookingCancelledNotificationEventByUser,
} from '@app/common/kafka/interfaces/kafka-event.interface';
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FcmService } from 'apps/home-service/src/fcm/fcm.service';
import { Model, Types } from 'mongoose';
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly fcmService: FcmService,
    @InjectModel(Notification.name)
    private notificationModel: Model<NotificationDocument>,
  ) {}

  async sendCancelledNotification(
    event: BookingCancelledNotificationEvent,
  ): Promise<void> {
    try {
      const sent = await this.fcmService.sendBookingCancellationNotification(
        event.data.fcmToken,
        event.data,
      );
      const notificationStatus = sent
        ? NotificationStatus.SENT
        : NotificationStatus.FAILED;

      // Create notification in database
      await this.createNotificationRecord({
        recipientType: UserRole.USER, // Patient is a USER
        recipientId: new Types.ObjectId(event.data.patientId),
        notificationType: this.mapTypeToEnum(event.data.type),
        title: '❌ تم إلغاء الحجز',
        message: `تم إلغاء موعدك مع ${event.data.doctorName} يوم ${this.formatDate(event.data.appointmentDate)} الساعة ${event.data.appointmentTime}. السبب: ${event.data.reason}`,
        status: notificationStatus,
        bookingId: event.data.bookingId,
        doctorId: event.data.doctorId,
      });
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
      try {
        await this.createNotificationRecord({
          recipientType: UserRole.USER,
          recipientId: new Types.ObjectId(event.data.patientId),
          notificationType: this.mapTypeToEnum(event.data.type),
          title: '❌ تم إلغاء الحجز',
          message: `تم إلغاء موعدك مع ${event.data.doctorName}. السبب: ${event.data.reason}`,
          status: NotificationStatus.FAILED,
          bookingId: event.data.bookingId,
          doctorId: event.data.doctorId,
        });
      } catch (dbError) {
        const err = dbError as Error;
        this.logger.error(
          `Failed to save notification to database: ${err.message}`,
        );
      }
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
      const notificationStatus = sent
        ? NotificationStatus.SENT
        : NotificationStatus.FAILED;

      // Create notification in database
      await this.createNotificationRecord({
        recipientType: UserRole.DOCTOR, // Recipient is DOCTOR
        recipientId: new Types.ObjectId(event.data.doctorId),
        notificationType: this.mapTypeToEnum(event.data.type),
        title: '🔔 المريض ألغى الحجز',
        message: `المريض ${event.data.patientName} ألغى حجز موعد يوم ${this.formatDate(event.data.appointmentDate)} الساعة ${event.data.appointmentTime}. السبب: ${event.data.reason}`,
        status: notificationStatus,
        bookingId: event.data.bookingId,
        patientId: event.data.patientId,
      });
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
      try {
        await this.createNotificationRecord({
          recipientType: UserRole.DOCTOR,
          recipientId: new Types.ObjectId(event.data.doctorId),
          notificationType: this.mapTypeToEnum(event.data.type),
          title: '🔔 المريض ألغى الحجز',
          message: `المريض ${event.data.patientName} ألغى حجزاً. السبب: ${event.data.reason}`,
          status: NotificationStatus.FAILED,
          bookingId: event.data.bookingId,
          patientId: event.data.patientId,
        });
      } catch (dbError) {
        const err = dbError as Error;
        this.logger.error(
          `Failed to save notification to database: ${err.message}`,
        );
      }
    }
  }

  /**
   * Create notification record in database
   */
  private async createNotificationRecord(data: {
    recipientType: UserRole;
    recipientId: Types.ObjectId;
    notificationType: NotificationTypes;
    title: string;
    message: string;
    status: NotificationStatus;
    bookingId?: string;
    doctorId?: string;
    patientId?: string;
  }): Promise<NotificationDocument> {
    try {
      const notification = await this.notificationModel.create({
        recipientType: data.recipientType,
        recipientId: data.recipientId,
        Notificationtype: data.notificationType,
        title: data.title,
        message: data.message,
        status: data.status,
        isRead: false,
      });

      this.logger.debug(
        `Notification saved to database: ${notification._id.toString()}`,
      );

      return notification;
    } catch (error) {
      // Handle duplicate key error (from unique index)
      if (error.code === 11000) {
        this.logger.warn(
          `Duplicate notification detected, skipping: ${JSON.stringify(error.keyValue)}`,
        );
      }

      throw error;
    }
  }

  /**
   * Map event type to notification enum
   */
  private mapTypeToEnum(
    type: 'DOCTOR_CANCELLED' | 'SLOT_PAUSED' | 'USER_CANCELLED',
  ): NotificationTypes {
    switch (type) {
      case 'DOCTOR_CANCELLED':
        return NotificationTypes.BOOKING_CANCELLED_BY_DOCTOR;
      case 'SLOT_PAUSED':
        return NotificationTypes.SLOT_PAUSED;
      case 'USER_CANCELLED':
        return NotificationTypes.BOOKING_CANCELLED_BY_USER;
      default:
        return NotificationTypes.BOOKING_CANCELLED_BY_DOCTOR;
    }
  }

  /**
   * Format date for display
   */
  private formatDate(date: Date | string): string {
    const d = new Date(date);
    return new Intl.DateTimeFormat('ar-SA', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(d);
  }

  /**
   * Get unread notifications for a user
   */
  async getUnreadNotifications(
    recipientId: string,
    recipientType: UserRole,
  ): Promise<NotificationDocument[]> {
    return this.notificationModel
      .find({
        recipientId: new Types.ObjectId(recipientId),
        recipientType,
        isRead: false,
      })
      .sort({ createdAt: -1 })
      .limit(50)
      .exec();
  }

  /**
   * Mark notification as read
   */
  async markAsRead(notificationId: string): Promise<void> {
    await this.notificationModel.findByIdAndUpdate(notificationId, {
      $set: { isRead: true },
    });
  }

  /**
   * Mark all notifications as read for a user
   */
  async markAllAsRead(
    recipientId: string,
    recipientType: UserRole,
  ): Promise<void> {
    await this.notificationModel.updateMany(
      {
        recipientId: new Types.ObjectId(recipientId),
        recipientType,
        isRead: false,
      },
      {
        $set: { isRead: true },
      },
    );
  }

  /**
   * Get notification count
   */
  async getUnreadCount(
    recipientId: string,
    recipientType: UserRole,
  ): Promise<number> {
    return this.notificationModel.countDocuments({
      recipientId: new Types.ObjectId(recipientId),
      recipientType,
      isRead: false,
    });
  }
}
