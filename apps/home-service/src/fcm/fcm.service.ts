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
