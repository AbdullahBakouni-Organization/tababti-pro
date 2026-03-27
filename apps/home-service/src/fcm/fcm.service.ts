import 'dotenv/config';
import { Injectable, Logger } from '@nestjs/common';
import * as admin from 'firebase-admin';

/**
 * FCM (Firebase Cloud Messaging) Service
 * Handles push notifications to mobile devices
 */
@Injectable()
export class FcmService {
  private readonly logger = new Logger(FcmService.name);

  constructor() {
    // Initialize Firebase Admin SDK
    // Make sure to set GOOGLE_APPLICATION_CREDENTIALS environment variable
    // Or provide credentials directly:

    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        }),
      });
    }
  }

  /**
   * Send booking cancellation notification via FCM
   */
  async sendBookingCancellationNotification(
    fcmToken: string,
    data: {
      bookingId: string;
      doctorName: string;
      appointmentDate: string;
      appointmentTime: string;
      reason: string;
      type: 'DOCTOR_CANCELLED' | 'SLOT_PAUSED';
    },
  ): Promise<boolean> {
    try {
      const message: admin.messaging.Message = {
        token: fcmToken,
        notification: {
          title: '❌ Appointment Cancelled',
          body: `Your appointment with Dr. ${data.doctorName} on ${data.appointmentDate} at ${data.appointmentTime} has been cancelled because of ${data.reason}.`,
        },
        data: {
          type: data.type,
          bookingId: data.bookingId,
          appointmentDate: data.appointmentDate,
          appointmentTime: data.appointmentTime,
          doctorName: data.doctorName,
          reason: data.reason,
          action: 'BOOK_NEW_APPOINTMENT',
          timestamp: new Date().toISOString(),
        },
        android: {
          priority: 'high',
          notification: {
            channelId: 'booking_updates',
            priority: 'high',
            defaultSound: true,
            defaultVibrateTimings: true,
            icon: 'ic_notification',
            color: '#FF0000',
          },
        },
        apns: {
          headers: {
            'apns-priority': '10',
          },
          payload: {
            aps: {
              alert: {
                title: '❌ Appointment Cancelled',
                body: `Your appointment with Dr. ${data.doctorName} on ${data.appointmentDate} at ${data.appointmentTime} has been cancelled.`,
              },
              sound: 'default',
              badge: 1,
            },
          },
        },
      };

      const response = await admin.messaging().send(message);

      this.logger.log(`FCM notification sent successfully`);

      return true;
    } catch (error) {
      this.logger.error(
        `Failed to send FCM notification: ${error.message}`,
        error.stack,
      );

      // Handle specific FCM errors
      if (error.code === 'messaging/invalid-registration-token') {
        this.logger.warn(`Invalid FCM token: ${fcmToken}`);
      } else if (error.code === 'messaging/registration-token-not-registered') {
        this.logger.warn(`FCM token not registered: ${fcmToken}`);
      }

      return false;
    }
  }

  async sendBookingCancellationNotificationToDoctor(
    fcmToken: string,
    data: {
      bookingId: string;
      doctorName: string;
      patientName: string;
      patientId: string;
      appointmentDate: string;
      appointmentTime: string;
      reason: string;
      type: 'USER_CANCELLED';
    },
  ): Promise<boolean> {
    try {
      const message: admin.messaging.Message = {
        token: fcmToken,
        notification: {
          title: '❌ Appointment Cancelled',
          body: `Your appointment with  ${data.patientName} on ${data.appointmentDate} at ${data.appointmentTime} has been cancelled because of ${data.reason}.`,
        },
        data: {
          type: data.type,
          bookingId: data.bookingId,
          appointmentDate: data.appointmentDate,
          appointmentTime: data.appointmentTime,
          doctorName: data.doctorName,
          patientName: data.patientName,
          reason: data.reason,
          action: 'BOOK_NEW_APPOINTMENT',
          timestamp: new Date().toISOString(),
        },
        android: {
          priority: 'high',
          notification: {
            channelId: 'booking_updates',
            priority: 'high',
            defaultSound: true,
            defaultVibrateTimings: true,
            icon: 'ic_notification',
            color: '#FF0000',
          },
        },
        apns: {
          headers: {
            'apns-priority': '10',
          },
          payload: {
            aps: {
              alert: {
                title: '❌ Appointment Cancelled',
                body: `Your appointment with ${data.patientName} on ${data.appointmentDate} at ${data.appointmentTime} has been cancelled.`,
              },
              sound: 'default',
              badge: 1,
            },
          },
        },
      };

      const response = await admin.messaging().send(message);

      this.logger.log(
        `FCM notification sent successfully. Message ID: ${response}`,
      );

      return true;
    } catch (error) {
      this.logger.error(
        `Failed to send FCM notification: ${error.message}`,
        error.stack,
      );

      // Handle specific FCM errors
      if (error.code === 'messaging/invalid-registration-token') {
        this.logger.warn(`Invalid FCM token: ${fcmToken}`);
      } else if (error.code === 'messaging/registration-token-not-registered') {
        this.logger.warn(`FCM token not registered: ${fcmToken}`);
      }

      return false;
    }
  }

  async sendBookingCompletionNotification(
    fcmToken: string,
    data: {
      bookingId: string;
      doctorName: string;
      appointmentDate: Date;
      appointmentTime: string;
      notes?: string;
      type: 'BOOKING_COMPLETED';
    },
  ): Promise<boolean> {
    try {
      const message: admin.messaging.Message = {
        token: fcmToken,
        notification: {
          title: '✅ تم إنجاز الموعد',
          body: `تم إنجاز موعدك مع ${data.doctorName} بنجاح. شكراً لثقتك!`,
        },
        data: {
          type: data.type,
          bookingId: data.bookingId,
          appointmentDate: data.appointmentDate.toString(),
          appointmentTime: data.appointmentTime,
          doctorName: data.doctorName,
          notes: data.notes || '',
          action: 'VIEW_COMPLETED_BOOKINGS',
          timestamp: new Date().toISOString(),
        },
        android: {
          priority: 'high',
          notification: {
            channelId: 'booking_updates',
            priority: 'high',
            defaultSound: true,
            defaultVibrateTimings: true,
            icon: 'ic_notification',
            color: '#4CAF50', // Green for completed
          },
        },
        apns: {
          headers: {
            'apns-priority': '10',
          },
          payload: {
            aps: {
              alert: {
                title: '✅ تم إنجاز الموعد',
                body: `تم إنجاز موعدك مع ${data.doctorName} بنجاح.`,
              },
              sound: 'default',
              badge: 1,
            },
          },
        },
      };

      const response = await admin.messaging().send(message);

      this.logger.log(
        `FCM completion notification sent successfully. Message ID: ${response}`,
      );

      return true;
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `Failed to send FCM completion notification: ${err.message}`,
        err.stack,
      );
      return false;
    }
  }

  async sendBookingRescheduledNotification(
    fcmToken: string,
    data: {
      bookingId: string;
      doctorName: string;
      appointmentDate: Date;
      appointmentTime: string;
      notes?: string;
      type: 'BOOKING_RESCHEDULED';
    },
  ): Promise<boolean> {
    try {
      const message: admin.messaging.Message = {
        token: fcmToken,
        notification: {
          title: 'your Appointement is RESCHEDULED',
          body: `your Appointement is RESCHEDULED from doctor ${data.doctorName}`,
        },
        data: {
          type: data.type,
          bookingId: data.bookingId,
          appointmentDate: data.appointmentDate.toString(),
          appointmentTime: data.appointmentTime,
          doctorName: data.doctorName,
          notes: data.notes || '',
          action: 'VIEW_RESCHEDULED_BOOKINGS',
          timestamp: new Date().toISOString(),
        },
        android: {
          priority: 'high',
          notification: {
            channelId: 'booking_updates',
            priority: 'high',
            defaultSound: true,
            defaultVibrateTimings: true,
            icon: 'ic_notification',
            color: '#4CAF50', // Green for completed
          },
        },
        apns: {
          headers: {
            'apns-priority': '10',
          },
          payload: {
            aps: {
              alert: {
                title: '✅ تم إنجاز الموعد',
                body: `تم إنجاز موعدك مع ${data.doctorName} بنجاح.`,
              },
              sound: 'default',
              badge: 1,
            },
          },
        },
      };

      const response = await admin.messaging().send(message);

      this.logger.log(
        `FCM completion notification sent successfully. Message ID: ${response}`,
      );

      return true;
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `Failed to send FCM completion notification: ${err.message}`,
        err.stack,
      );
      return false;
    }
  }

  /**
   * Send notification to multiple users
   */
  async sendMulticastNotification(
    fcmTokens: string[],
    data: {
      bookingId: string;
      doctorName: string;
      appointmentDate: string;
      appointmentTime: string;
      reason: string;
      type: 'DOCTOR_CANCELLED' | 'SLOT_PAUSED';
    },
  ): Promise<{
    successCount: number;
    failureCount: number;
    invalidTokens: string[];
  }> {
    if (fcmTokens.length === 0) {
      return { successCount: 0, failureCount: 0, invalidTokens: [] };
    }

    try {
      const message: admin.messaging.MulticastMessage = {
        tokens: fcmTokens,
        notification: {
          title: '❌ Appointment Cancelled',
          body: `Your appointment with Dr. ${data.doctorName} on ${data.appointmentDate} at ${data.appointmentTime} has been cancelled.`,
        },
        data: {
          type: data.type,
          bookingId: data.bookingId,
          appointmentDate: data.appointmentDate,
          appointmentTime: data.appointmentTime,
          doctorName: data.doctorName,
          reason: data.reason,
          action: 'BOOK_NEW_APPOINTMENT',
          timestamp: new Date().toISOString(),
        },
        android: {
          priority: 'high',
          notification: {
            channelId: 'booking_updates',
            priority: 'high',
            defaultSound: true,
          },
        },
      };

      const response = await admin.messaging().sendEachForMulticast(message);

      const invalidTokens: string[] = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          const error = resp.error;
          if (
            error?.code === 'messaging/invalid-registration-token' ||
            error?.code === 'messaging/registration-token-not-registered'
          ) {
            invalidTokens.push(fcmTokens[idx]);
          }
        }
      });

      this.logger.log(
        `Multicast notification sent. Success: ${response.successCount}, Failed: ${response.failureCount}`,
      );

      return {
        successCount: response.successCount,
        failureCount: response.failureCount,
        invalidTokens,
      };
    } catch (error) {
      this.logger.error(
        `Failed to send multicast notification: ${error.message}`,
        error.stack,
      );

      return {
        successCount: 0,
        failureCount: fcmTokens.length,
        invalidTokens: [],
      };
    }
  }

  //Admin Approved Rejected Posts
  async sendAdminApprovedPostNotification(
    fcmToken: string,
    data: {
      postId: string;
      doctorName: string;
      doctorId: string;
    },
  ): Promise<boolean> {
    try {
      const message: admin.messaging.Message = {
        token: fcmToken,
        notification: {
          title: 'Post Approved',
          body: `Your post has been approved by the admin.`,
        },
        data: {
          postId: data.postId,
          doctorName: data.doctorName,
          doctorId: data.doctorId,
          action: 'Show Post',
          timestamp: new Date().toISOString(),
        },
        android: {
          priority: 'high',
          notification: {
            channelId: 'post_approved',
            priority: 'high',
            defaultSound: true,
            defaultVibrateTimings: true,
            icon: 'ic_notification',
            color: '#FF0000',
          },
        },
        apns: {
          headers: {
            'apns-priority': '10',
          },
          payload: {
            aps: {
              alert: {
                title: 'Post Approved',
                body: `Your post has been approved by the admin.`,
              },
              sound: 'default',
              badge: 1,
            },
          },
        },
      };

      await admin.messaging().send(message);

      this.logger.log(`FCM notification sent successfully`);

      return true;
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `Failed to send FCM notification: ${err.message}`,
        err.stack,
      );

      // Handle specific FCM errors
      if (error.code === 'messaging/invalid-registration-token') {
        this.logger.warn(`Invalid FCM token: ${fcmToken}`);
      } else if (error.code === 'messaging/registration-token-not-registered') {
        this.logger.warn(`FCM token not registered: ${fcmToken}`);
      }

      return false;
    }
  }

  async sendAdminRejectedPostNotification(
    fcmToken: string,
    data: {
      postId: string;
      doctorName: string;
      doctorId: string;
      reason: string;
    },
  ): Promise<boolean> {
    try {
      const message: admin.messaging.Message = {
        token: fcmToken,
        notification: {
          title: 'Post Rejected',
          body: `Your post has been rejected by the admin. Reason: ${data.reason}`,
        },
        data: {
          postId: data.postId,
          doctorName: data.doctorName,
          doctorId: data.doctorId,
          action: 'Show Reason',
          timestamp: new Date().toISOString(),
        },
        android: {
          priority: 'high',
          notification: {
            channelId: 'X post_rejected',
            priority: 'high',
            defaultSound: true,
            defaultVibrateTimings: true,
            icon: 'ic_notification',
            color: '#FF0000',
          },
        },
        apns: {
          headers: {
            'apns-priority': '10',
          },
          payload: {
            aps: {
              alert: {
                title: 'Post Rejected',
                body: `Your post has been rejected by the admin. Reason: ${data.reason}`,
              },
              sound: 'default',
              badge: 1,
            },
          },
        },
      };

      await admin.messaging().send(message);

      this.logger.log(`FCM notification sent successfully`);

      return true;
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `Failed to send FCM notification: ${err.message}`,
        err.stack,
      );

      // Handle specific FCM errors
      if (error.code === 'messaging/invalid-registration-token') {
        this.logger.warn(`Invalid FCM token: ${fcmToken}`);
      } else if (error.code === 'messaging/registration-token-not-registered') {
        this.logger.warn(`FCM token not registered: ${fcmToken}`);
      }

      return false;
    }
  }

  async sendAdminApprovedGalleryImagesNotification(
    fcmToken: string,
    data: {
      doctorId: string;
      doctorName: string;
      galleryIds: string[];
    },
  ): Promise<boolean> {
    try {
      const imagesCount = data.galleryIds.length;
      const title = 'Gallery Images Approved';
      const body =
        imagesCount === 1
          ? `Your gallery image has been approved by the admin.`
          : `${imagesCount} gallery images have been approved by the admin.`;

      const message: admin.messaging.Message = {
        token: fcmToken,
        notification: {
          title,
          body,
        },
        data: {
          doctorId: data.doctorId,
          doctorName: data.doctorName,
          galleryIds: JSON.stringify(data.galleryIds),
          imagesCount: String(imagesCount),
          action: 'Show Gallery',
          timestamp: new Date().toISOString(),
        },
        android: {
          priority: 'high',
          notification: {
            channelId: 'gallery_approved',
            priority: 'high',
            defaultSound: true,
            defaultVibrateTimings: true,
            icon: 'ic_notification',
            color: '#FF0000',
          },
        },
        apns: {
          headers: {
            'apns-priority': '10',
          },
          payload: {
            aps: {
              alert: {
                title,
                body,
              },
              sound: 'default',
              badge: 1,
            },
          },
        },
      };

      await admin.messaging().send(message);
      this.logger.log(
        `FCM gallery approval notification sent successfully for doctor ${data.doctorId} — ${imagesCount} image(s)`,
      );
      return true;
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `Failed to send FCM gallery approval notification: ${err.message}`,
        err.stack,
      );

      if (error.code === 'messaging/invalid-registration-token') {
        this.logger.warn(`Invalid FCM token: ${fcmToken}`);
      } else if (error.code === 'messaging/registration-token-not-registered') {
        this.logger.warn(`FCM token not registered: ${fcmToken}`);
      }

      return false;
    }
  }
  async sendAdminRejectedGalleryImagesNotification(
    fcmToken: string,
    data: {
      doctorId: string;
      doctorName: string;
      rejectionReason: string;
      galleryIds: string[];
    },
  ): Promise<boolean> {
    try {
      const imagesCount = data.galleryIds.length;
      const title = 'Gallery Images Rejected';
      const body =
        imagesCount === 1
          ? `Your gallery image has been rejected. Reason: ${data.rejectionReason}`
          : `${imagesCount} gallery images have been rejected. Reason: ${data.rejectionReason}`;

      const message: admin.messaging.Message = {
        token: fcmToken,
        notification: {
          title,
          body,
        },
        data: {
          doctorId: data.doctorId,
          doctorName: data.doctorName,
          galleryIds: JSON.stringify(data.galleryIds),
          imagesCount: String(imagesCount),
          rejectionReason: data.rejectionReason,
          action: 'Show Gallery',
          timestamp: new Date().toISOString(),
        },
        android: {
          priority: 'high',
          notification: {
            channelId: 'gallery_rejected',
            priority: 'high',
            defaultSound: true,
            defaultVibrateTimings: true,
            icon: 'ic_notification',
            color: '#FF0000',
          },
        },
        apns: {
          headers: {
            'apns-priority': '10',
          },
          payload: {
            aps: {
              alert: {
                title,
                body,
              },
              sound: 'default',
              badge: 1,
            },
          },
        },
      };

      await admin.messaging().send(message);
      this.logger.log(
        `FCM gallery rejection notification sent successfully for doctor ${data.doctorId} — ${imagesCount} image(s)`,
      );
      return true;
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `Failed to send FCM gallery rejection notification: ${err.message}`,
        err.stack,
      );

      if (error.code === 'messaging/invalid-registration-token') {
        this.logger.warn(`Invalid FCM token: ${fcmToken}`);
      } else if (error.code === 'messaging/registration-token-not-registered') {
        this.logger.warn(`FCM token not registered: ${fcmToken}`);
      }

      return false;
    }
  }
  /**
   * Send slot availability update notification
   */
  async sendSlotsRefreshedNotification(
    fcmToken: string,
    doctorName: string,
    availableSlotCount: number,
  ): Promise<boolean> {
    try {
      const message: admin.messaging.Message = {
        token: fcmToken,
        notification: {
          title: '📅 New Slots Available',
          body: `Dr. ${doctorName} has ${availableSlotCount} new appointment slots available. Book now!`,
        },
        data: {
          type: 'SLOTS_REFRESHED',
          doctorName,
          availableSlotCount: availableSlotCount.toString(),
          action: 'VIEW_AVAILABLE_SLOTS',
          timestamp: new Date().toISOString(),
        },
      };

      const response = await admin.messaging().send(message);
      this.logger.log(`Slots refreshed notification sent: ${response}`);

      return true;
    } catch (error) {
      this.logger.error(
        `Failed to send slots refreshed notification: ${error.message}`,
      );
      return false;
    }
  }

  /**
   * Verify FCM token is valid
   */
  async verifyToken(fcmToken: string): Promise<boolean> {
    try {
      // Try sending a dry-run message
      await admin.messaging().send(
        {
          token: fcmToken,
          data: { test: 'true' },
        },
        true, // dry run
      );
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Subscribe tokens to a topic (e.g., doctor updates)
   */
  async subscribeToTopic(
    fcmTokens: string[],
    topic: string,
  ): Promise<{ successCount: number; failureCount: number }> {
    try {
      const response = await admin
        .messaging()
        .subscribeToTopic(fcmTokens, topic);

      this.logger.log(
        `Subscribed ${response.successCount} tokens to topic: ${topic}`,
      );

      return {
        successCount: response.successCount,
        failureCount: response.failureCount,
      };
    } catch (error) {
      this.logger.error(`Failed to subscribe to topic: ${error.message}`);
      return { successCount: 0, failureCount: fcmTokens.length };
    }
  }
}
