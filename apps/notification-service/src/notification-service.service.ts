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
  AdminApprovedGalleryImagesEvent,
  AdminApprovedPostEvent,
  AdminApprovedUserQuestionsEvent,
  AdminRejectedGalleryImagesEvent,
  AdminRejectedPostEvent,
  AdminRejectedUserQuestionsEvent,
  BookingCancelledNotificationEvent,
  BookingCancelledNotificationEventByUser,
  BookingCompletedNotificationEvent,
  BookingRescheduledNotificationEvent,
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

  async sendCompletedNotificationToPatient(
    event: BookingCompletedNotificationEvent,
  ): Promise<void> {
    try {
      // Send FCM notification
      const sent = await this.fcmService.sendBookingCompletionNotification(
        event.data.fcmToken,
        event.data,
      );

      // Determine notification status
      const notificationStatus = sent
        ? NotificationStatus.SENT
        : NotificationStatus.FAILED;

      // Create notification in database
      await this.createNotificationRecord({
        recipientType: UserRole.USER, // Patient is a USER
        recipientId: new Types.ObjectId(event.data.patientId),
        notificationType: NotificationTypes.BOOKING_COMPLETED,
        title: '✅ تم إنجاز الموعد',
        message: `تم إنجاز موعدك مع ${event.data.doctorName} بنجاح. ${event.data.notes ? `ملاحظات: ${event.data.notes}` : ''}`,
        status: notificationStatus,
        bookingId: event.data.bookingId,
        doctorId: event.data.doctorId,
      });

      if (sent) {
        this.logger.log(
          `✅ FCM completion notification sent and saved for booking ${event.data.bookingId}`,
        );
      } else {
        this.logger.warn(
          `⚠️ Failed to send FCM but notification saved for booking ${event.data.bookingId}`,
        );
      }
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `❌ Error sending FCM completion notification: ${err.message}`,
        err.stack,
      );

      // Save as failed notification
      try {
        await this.createNotificationRecord({
          recipientType: UserRole.USER,
          recipientId: new Types.ObjectId(event.data.patientId),
          notificationType: NotificationTypes.BOOKING_COMPLETED,
          title: '✅ تم إنجاز الموعد',
          message: `تم إنجاز موعدك مع ${event.data.doctorName}.`,
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

  async sendRescheduledNotificationToPatient(
    event: BookingRescheduledNotificationEvent,
  ): Promise<void> {
    try {
      // Send FCM notification
      const sent = await this.fcmService.sendBookingRescheduledNotification(
        event.data.fcmToken,
        event.data,
      );

      // Determine notification status
      const notificationStatus = sent
        ? NotificationStatus.SENT
        : NotificationStatus.FAILED;

      // Create notification in database
      await this.createNotificationRecord({
        recipientType: UserRole.USER, // Patient is a USER
        recipientId: new Types.ObjectId(event.data.patientId),
        notificationType: NotificationTypes.BOOKING_RESCHEDULED,
        title: 'your Appointement is RESCHEDULED',
        message: `your Appointement is RESCHEDULED from doctor ${event.data.doctorName} because of ${event.data.reason} `,
        status: notificationStatus,
        bookingId: event.data.bookingId,
        doctorId: event.data.doctorId,
      });

      if (sent) {
        this.logger.log(
          `✅ FCM completion notification sent and saved for booking ${event.data.bookingId}`,
        );
      } else {
        this.logger.warn(
          `⚠️ Failed to send FCM but notification saved for booking ${event.data.bookingId}`,
        );
      }
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `❌ Error sending FCM completion notification: ${err.message}`,
        err.stack,
      );

      // Save as failed notification
      try {
        await this.createNotificationRecord({
          recipientType: UserRole.USER,
          recipientId: new Types.ObjectId(event.data.patientId),
          notificationType: NotificationTypes.BOOKING_COMPLETED,
          title: 'your Appointement is RESCHEDULED',
          message: `your Appointement is RESCHEDULED from doctor ${event.data.doctorName} because of ${event.data.reason} `,
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

  async sendAdminApprovedPostNotification(
    event: AdminApprovedPostEvent,
  ): Promise<void> {
    try {
      // Send FCM notification
      const sent = await this.fcmService.sendAdminApprovedPostNotification(
        event.data.fcmToken,
        event.data,
      );

      // Determine notification status
      const notificationStatus = sent
        ? NotificationStatus.SENT
        : NotificationStatus.FAILED;

      // Create notification in database
      await this.createNotificationRecord({
        recipientType: UserRole.DOCTOR, // Doctor is a DOCTOR
        recipientId: new Types.ObjectId(event.data.doctorId),
        notificationType: NotificationTypes.ADMIN_APPROVED_POST,
        title: 'your post is approved',
        message: `your post is approved by Admin`,
        status: notificationStatus,
        doctorId: event.data.doctorId,
      });

      if (sent) {
        this.logger.log(
          `✅ FCM completion notification sent to doctor ${event.data.doctorId}`,
        );
      } else {
        this.logger.warn(
          `⚠️ Failed to send FCM but notification saved doctor ${event.data.doctorId}`,
        );
      }
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `❌ Error sending FCM completion notification: ${err.message}`,
        err.stack,
      );

      // Save as failed notification
      try {
        await this.createNotificationRecord({
          recipientType: UserRole.DOCTOR, // Doctor is a DOCTOR
          recipientId: new Types.ObjectId(event.data.doctorId),
          notificationType: NotificationTypes.ADMIN_APPROVED_POST,
          title: 'your post is approved',
          message: `your post is approved by Admin`,
          status: NotificationStatus.FAILED,
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

  async sendAdminRejectedPostNotification(
    event: AdminRejectedPostEvent,
  ): Promise<void> {
    try {
      // Send FCM notification
      const sent = await this.fcmService.sendAdminRejectedPostNotification(
        event.data.fcmToken,
        event.data,
      );

      // Determine notification status
      const notificationStatus = sent
        ? NotificationStatus.SENT
        : NotificationStatus.FAILED;

      // Create notification in database
      await this.createNotificationRecord({
        recipientType: UserRole.DOCTOR, // Doctor is a DOCTOR
        recipientId: new Types.ObjectId(event.data.doctorId),
        notificationType: NotificationTypes.ADMIN_REJECTED_POST,
        title: 'your post is rejected',
        message: `your post is rejected by Admin`,
        status: notificationStatus,
        doctorId: event.data.doctorId,
      });

      if (sent) {
        this.logger.log(
          `✅ FCM completion notification sent to doctor ${event.data.doctorId}`,
        );
      } else {
        this.logger.warn(
          `⚠️ Failed to send FCM but notification saved doctor ${event.data.doctorId}`,
        );
      }
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `❌ Error sending FCM completion notification: ${err.message}`,
        err.stack,
      );

      // Save as failed notification
      try {
        await this.createNotificationRecord({
          recipientType: UserRole.DOCTOR, // Doctor is a DOCTOR
          recipientId: new Types.ObjectId(event.data.doctorId),
          notificationType: NotificationTypes.ADMIN_REJECTED_POST,
          title: 'your post is rejected',
          message: `your post is rejected by Admin`,
          status: NotificationStatus.FAILED,
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

  async sendAdminApprovedGalleryNotification(
    event: AdminApprovedGalleryImagesEvent,
  ): Promise<void> {
    try {
      // Send FCM notification
      const sent =
        await this.fcmService.sendAdminApprovedGalleryImagesNotification(
          event.data.fcmToken,
          {
            doctorId: event.data.doctorId,
            doctorName: event.data.doctorName,
            galleryIds: event.data.GalleryIds,
          },
        );

      // Determine notification status
      const notificationStatus = sent
        ? NotificationStatus.SENT
        : NotificationStatus.FAILED;

      // Create notification in database
      await this.createNotificationRecord({
        recipientType: UserRole.DOCTOR, // Doctor is a DOCTOR
        recipientId: new Types.ObjectId(event.data.doctorId),
        notificationType: NotificationTypes.ADMIN_REJECTED_POST,
        title: 'your gallery is approved',
        message: `your gallery is approved by Admin`,
        status: notificationStatus,
        doctorId: event.data.doctorId,
      });

      if (sent) {
        this.logger.log(
          `✅ FCM completion notification sent to doctor ${event.data.doctorId}`,
        );
      } else {
        this.logger.warn(
          `⚠️ Failed to send FCM but notification saved doctor ${event.data.doctorId}`,
        );
      }
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `❌ Error sending FCM completion notification: ${err.message}`,
        err.stack,
      );

      // Save as failed notification
      try {
        await this.createNotificationRecord({
          recipientType: UserRole.DOCTOR, // Doctor is a DOCTOR
          recipientId: new Types.ObjectId(event.data.doctorId),
          notificationType: NotificationTypes.ADMIN_APPROVED_GALLERY_IMAGES,
          title: 'your gallery is approved',
          message: `your gallery is approved by Admin`,
          status: NotificationStatus.FAILED,
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

  async sendAdminRejectedGalleryNotification(
    event: AdminRejectedGalleryImagesEvent,
  ): Promise<void> {
    try {
      // Send FCM notification
      const sent =
        await this.fcmService.sendAdminRejectedGalleryImagesNotification(
          event.data.fcmToken,
          {
            doctorId: event.data.doctorId,
            doctorName: event.data.doctorName,
            rejectionReason: event.data.rejectionReason,
            galleryIds: event.data.GalleryIds,
          },
        );

      // Determine notification status
      const notificationStatus = sent
        ? NotificationStatus.SENT
        : NotificationStatus.FAILED;

      // Create notification in database
      await this.createNotificationRecord({
        recipientType: UserRole.DOCTOR, // Doctor is a DOCTOR
        recipientId: new Types.ObjectId(event.data.doctorId),
        notificationType: NotificationTypes.ADMIN_REJECTED_GALLERY_IMAGES,
        title: 'your gallery is rejected',
        message: `your gallery is rejected by Admin`,
        status: notificationStatus,
        doctorId: event.data.doctorId,
      });

      if (sent) {
        this.logger.log(
          `✅ FCM completion notification sent to doctor ${event.data.doctorId}`,
        );
      } else {
        this.logger.warn(
          `⚠️ Failed to send FCM but notification saved doctor ${event.data.doctorId}`,
        );
      }
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `❌ Error sending FCM completion notification: ${err.message}`,
        err.stack,
      );

      // Save as failed notification
      try {
        await this.createNotificationRecord({
          recipientType: UserRole.DOCTOR, // Doctor is a DOCTOR
          recipientId: new Types.ObjectId(event.data.doctorId),
          notificationType: NotificationTypes.ADMIN_REJECTED_GALLERY_IMAGES,
          title: 'your gallery is rejected',
          message: `your gallery is rejected by Admin`,
          status: NotificationStatus.FAILED,
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

  async sendAdminApprovedUserQuestionsNotification(
    event: AdminApprovedUserQuestionsEvent,
  ): Promise<void> {
    try {
      // Send FCM notification
      const sent =
        await this.fcmService.sendAdminApprovedUserQuestionsNotification(
          event.data.fcmToken,
          {
            userId: event.data.userId,
            userName: event.data.userName,
            questionIds: event.data.questionIds,
          },
        );

      // Determine notification status
      const notificationStatus = sent
        ? NotificationStatus.SENT
        : NotificationStatus.FAILED;

      // Create notification in database
      await this.createNotificationRecord({
        recipientType: UserRole.USER, // User is a USER
        recipientId: new Types.ObjectId(event.data.userId),
        notificationType: NotificationTypes.ADMIN_APPROVED_USER_QUESTIONS,
        title: 'your questions are approved',
        message: `your questions are approved by Admin`,
        status: notificationStatus,
        patientId: event.data.userId,
      });

      if (sent) {
        this.logger.log(
          `✅ FCM completion notification sent to patient ${event.data.userId}`,
        );
      } else {
        this.logger.warn(
          `⚠️ Failed to send FCM but notification saved for patient ${event.data.userId}`,
        );
      }
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `❌ Error sending FCM completion notification: ${err.message}`,
        err.stack,
      );

      // Save as failed notification
      try {
        await this.createNotificationRecord({
          recipientType: UserRole.USER, // User is a USER
          recipientId: new Types.ObjectId(event.data.userId),
          notificationType: NotificationTypes.ADMIN_APPROVED_USER_QUESTIONS,
          title: 'your questions are approved',
          message: `your questions are approved by Admin`,
          status: NotificationStatus.FAILED,
          patientId: event.data.userId,
        });
      } catch (dbError) {
        const err = dbError as Error;
        this.logger.error(
          `Failed to save notification to database: ${err.message}`,
        );
      }
    }
  }

  async sendAdminRejectedUserQuestionsNotification(
    event: AdminRejectedUserQuestionsEvent,
  ): Promise<void> {
    try {
      // Send FCM notification
      const sent =
        await this.fcmService.sendAdminRejectedUserQuestionsNotification(
          event.data.fcmToken,
          {
            userId: event.data.userId,
            userName: event.data.userName,
            questionIds: event.data.questionIds,
            rejectionReason: event.data.rejectionReason,
          },
        );

      // Determine notification status
      const notificationStatus = sent
        ? NotificationStatus.SENT
        : NotificationStatus.FAILED;

      // Create notification in database
      await this.createNotificationRecord({
        recipientType: UserRole.USER, // User is a USER
        recipientId: new Types.ObjectId(event.data.userId),
        notificationType: NotificationTypes.ADMIN_REJECTED_USER_QUESTIONS,
        title: 'your questions are rejected',
        message: `your questions are rejected by Admin: ${event.data.rejectionReason}`,
        status: notificationStatus,
        patientId: event.data.userId,
      });

      if (sent) {
        this.logger.log(
          `✅ FCM completion notification sent to patient ${event.data.userId}`,
        );
      } else {
        this.logger.warn(
          `⚠️ Failed to send FCM but notification saved for patient ${event.data.userId}`,
        );
      }
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `❌ Error sending FCM completion notification: ${err.message}`,
        err.stack,
      );

      // Save as failed notification
      try {
        await this.createNotificationRecord({
          recipientType: UserRole.USER, // User is a USER
          recipientId: new Types.ObjectId(event.data.userId),
          notificationType: NotificationTypes.ADMIN_REJECTED_USER_QUESTIONS,
          title: 'your questions are rejected',
          message: `your questions are rejected by Admin: ${event.data.rejectionReason}`,
          status: NotificationStatus.FAILED,
          patientId: event.data.userId,
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
  ): Promise<{ notifications: { data: NotificationDocument[] } }> {
    const notifications = await this.notificationModel
      .find({
        recipientId: new Types.ObjectId(recipientId),
        recipientType,
        isRead: false,
      })
      .sort({ createdAt: -1 })
      .limit(50)
      .exec();

    return {
      notifications: {
        data: notifications,
      },
    };
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
