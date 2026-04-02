import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { NotificationServiceController } from './notification-service.controller';
import { NotificationService } from './notification-service.service';
import { UserRole } from '@app/common/database/schemas/common.enums';

describe('NotificationServiceController', () => {
  let controller: NotificationServiceController;
  let notificationService: Record<string, jest.Mock>;

  const patientId = new Types.ObjectId().toString();
  const doctorId = new Types.ObjectId().toString();
  const bookingId = new Types.ObjectId().toString();

  beforeEach(async () => {
    notificationService = {
      sendCancelledNotification: jest.fn().mockResolvedValue(undefined),
      sendCancelledNotificationToDoctor: jest.fn().mockResolvedValue(undefined),
      sendCompletedNotificationToPatient: jest
        .fn()
        .mockResolvedValue(undefined),
      sendRescheduledNotificationToPatient: jest
        .fn()
        .mockResolvedValue(undefined),
      sendAdminApprovedPostNotification: jest.fn().mockResolvedValue(undefined),
      sendAdminRejectedPostNotification: jest.fn().mockResolvedValue(undefined),
      sendAdminApprovedGalleryNotification: jest
        .fn()
        .mockResolvedValue(undefined),
      sendAdminRejectedGalleryNotification: jest
        .fn()
        .mockResolvedValue(undefined),
      sendAdminApprovedUserQuestionsNotification: jest
        .fn()
        .mockResolvedValue(undefined),
      sendAdminRejectedUserQuestionsNotification: jest
        .fn()
        .mockResolvedValue(undefined),
      getUnreadNotifications: jest.fn().mockResolvedValue({
        notifications: { data: [] },
      }),
      getUnreadCount: jest.fn().mockResolvedValue(3),
      markAsRead: jest.fn().mockResolvedValue(undefined),
      markAllAsRead: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotificationServiceController],
      providers: [
        { provide: NotificationService, useValue: notificationService },
      ],
    }).compile();

    controller = module.get<NotificationServiceController>(
      NotificationServiceController,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ─── Kafka Event Handlers ─────────────────────────────────────────────────

  describe('handleBookingCancelledNotification()', () => {
    const event = {
      data: {
        patientId,
        doctorId,
        bookingId,
        doctorName: 'Dr. Ahmad',
        fcmToken: 'token',
        appointmentDate: new Date().toISOString(),
        appointmentTime: '10:00',
        reason: 'Doctor unavailable',
        type: 'DOCTOR_CANCELLED' as const,
      },
    };

    it('delegates to notificationService.sendCancelledNotification', async () => {
      await controller.handleBookingCancelledNotification(event as any);

      expect(
        notificationService.sendCancelledNotification,
      ).toHaveBeenCalledWith(event);
    });

    it('does not throw when service throws', async () => {
      notificationService.sendCancelledNotification.mockRejectedValue(
        new Error('service error'),
      );

      await expect(
        controller.handleBookingCancelledNotification(event as any),
      ).resolves.not.toThrow();
    });
  });

  describe('handleBookingCancelledNotificationByUser()', () => {
    const event = {
      data: {
        doctorId,
        doctorName: 'Dr. Ahmad',
        patientName: 'Ali',
        fcmToken: 'token',
        bookingId,
        appointmentDate: new Date().toISOString(),
        appointmentTime: '14:00',
        reason: 'Patient request',
        type: 'USER_CANCELLED' as const,
      },
    };

    it('delegates to notificationService.sendCancelledNotificationToDoctor', async () => {
      await controller.handleBookingCancelledNotificationByUser(event as any);

      expect(
        notificationService.sendCancelledNotificationToDoctor,
      ).toHaveBeenCalledWith(event);
    });

    it('does not throw when service throws', async () => {
      notificationService.sendCancelledNotificationToDoctor.mockRejectedValue(
        new Error('service error'),
      );

      await expect(
        controller.handleBookingCancelledNotificationByUser(event as any),
      ).resolves.not.toThrow();
    });
  });

  describe('handleBookingCompleted()', () => {
    const event = {
      data: {
        patientId,
        doctorId,
        bookingId,
        doctorName: 'Dr. Ahmad',
        patientName: 'Ali',
        fcmToken: 'token',
        notes: 'All good',
      },
    };

    it('delegates to notificationService.sendCompletedNotificationToPatient', async () => {
      await controller.handleBookingCompleted(event as any);

      expect(
        notificationService.sendCompletedNotificationToPatient,
      ).toHaveBeenCalledWith(event);
    });

    it('does not throw when service throws', async () => {
      notificationService.sendCompletedNotificationToPatient.mockRejectedValue(
        new Error('service error'),
      );

      await expect(
        controller.handleBookingCompleted(event as any),
      ).resolves.not.toThrow();
    });
  });

  describe('handleBookingRescheduled()', () => {
    const event = {
      data: {
        patientId,
        doctorId,
        bookingId,
        doctorName: 'Dr. Ahmad',
        patientName: 'Ali',
        fcmToken: 'token',
        reason: 'Schedule conflict',
      },
    };

    it('delegates to notificationService.sendRescheduledNotificationToPatient', async () => {
      await controller.handleBookingRescheduled(event as any);

      expect(
        notificationService.sendRescheduledNotificationToPatient,
      ).toHaveBeenCalledWith(event);
    });

    it('does not throw when service throws', async () => {
      notificationService.sendRescheduledNotificationToPatient.mockRejectedValue(
        new Error('service error'),
      );

      await expect(
        controller.handleBookingRescheduled(event as any),
      ).resolves.not.toThrow();
    });
  });

  describe('handleAdminApprovedPost()', () => {
    const event = {
      data: {
        doctorId,
        doctorName: 'Dr. Ahmad',
        fcmToken: 'token',
        postId: new Types.ObjectId().toString(),
      },
    };

    it('delegates to notificationService.sendAdminApprovedPostNotification', async () => {
      await controller.handleAdminApprovedPost(event as any);

      expect(
        notificationService.sendAdminApprovedPostNotification,
      ).toHaveBeenCalledWith(event);
    });

    it('does not throw when service throws', async () => {
      notificationService.sendAdminApprovedPostNotification.mockRejectedValue(
        new Error('service error'),
      );

      await expect(
        controller.handleAdminApprovedPost(event as any),
      ).resolves.not.toThrow();
    });
  });

  describe('handleAdminRejectedPost()', () => {
    const event = {
      data: {
        doctorId,
        doctorName: 'Dr. Ahmad',
        fcmToken: 'token',
        postId: new Types.ObjectId().toString(),
      },
    };

    it('delegates to notificationService.sendAdminRejectedPostNotification', async () => {
      await controller.handleAdminRejectedPost(event as any);

      expect(
        notificationService.sendAdminRejectedPostNotification,
      ).toHaveBeenCalledWith(event);
    });

    it('does not throw when service throws', async () => {
      notificationService.sendAdminRejectedPostNotification.mockRejectedValue(
        new Error('service error'),
      );

      await expect(
        controller.handleAdminRejectedPost(event as any),
      ).resolves.not.toThrow();
    });
  });

  describe('handleAdminApprovedGallery()', () => {
    const event = {
      data: {
        doctorId,
        doctorName: 'Dr. Ahmad',
        fcmToken: 'token',
        GalleryIds: [new Types.ObjectId().toString()],
      },
    };

    it('delegates to notificationService.sendAdminApprovedGalleryNotification', async () => {
      await controller.handleAdminApprovedGallery(event as any);

      expect(
        notificationService.sendAdminApprovedGalleryNotification,
      ).toHaveBeenCalledWith(event);
    });

    it('does not throw when service throws', async () => {
      notificationService.sendAdminApprovedGalleryNotification.mockRejectedValue(
        new Error('service error'),
      );

      await expect(
        controller.handleAdminApprovedGallery(event as any),
      ).resolves.not.toThrow();
    });
  });

  describe('handleAdminRejectedGallery()', () => {
    const event = {
      data: {
        doctorId,
        doctorName: 'Dr. Ahmad',
        fcmToken: 'token',
        GalleryIds: [new Types.ObjectId().toString()],
        rejectionReason: 'Inappropriate content',
      },
    };

    it('delegates to notificationService.sendAdminRejectedGalleryNotification', async () => {
      await controller.handleAdminRejectedGallery(event as any);

      expect(
        notificationService.sendAdminRejectedGalleryNotification,
      ).toHaveBeenCalledWith(event);
    });

    it('does not throw when service throws', async () => {
      notificationService.sendAdminRejectedGalleryNotification.mockRejectedValue(
        new Error('service error'),
      );

      await expect(
        controller.handleAdminRejectedGallery(event as any),
      ).resolves.not.toThrow();
    });
  });

  describe('handleAdminApprovedUserQuestions()', () => {
    const event = {
      data: {
        userId: patientId,
        userName: 'Ali',
        fcmToken: 'token',
        questionIds: [new Types.ObjectId().toString()],
      },
    };

    it('delegates to notificationService.sendAdminApprovedUserQuestionsNotification', async () => {
      await controller.handleAdminApprovedUserQuestions(event as any);

      expect(
        notificationService.sendAdminApprovedUserQuestionsNotification,
      ).toHaveBeenCalledWith(event);
    });

    it('does not throw when service throws', async () => {
      notificationService.sendAdminApprovedUserQuestionsNotification.mockRejectedValue(
        new Error('service error'),
      );

      await expect(
        controller.handleAdminApprovedUserQuestions(event as any),
      ).resolves.not.toThrow();
    });
  });

  describe('handleAdminRejectedUserQuestions()', () => {
    const event = {
      data: {
        userId: patientId,
        userName: 'Ali',
        fcmToken: 'token',
        questionIds: [new Types.ObjectId().toString()],
        rejectionReason: 'Spam',
      },
    };

    it('delegates to notificationService.sendAdminRejectedUserQuestionsNotification', async () => {
      await controller.handleAdminRejectedUserQuestions(event as any);

      expect(
        notificationService.sendAdminRejectedUserQuestionsNotification,
      ).toHaveBeenCalledWith(event);
    });

    it('does not throw when service throws', async () => {
      notificationService.sendAdminRejectedUserQuestionsNotification.mockRejectedValue(
        new Error('service error'),
      );

      await expect(
        controller.handleAdminRejectedUserQuestions(event as any),
      ).resolves.not.toThrow();
    });
  });

  // ─── HTTP Endpoints ───────────────────────────────────────────────────────

  describe('getUnreadNotifications()', () => {
    it('calls service with parsed recipientId and recipientType', async () => {
      const mockReq = {
        user: {
          entity: { _id: new Types.ObjectId(patientId) },
          role: UserRole.USER,
        },
      };

      const result = await controller.getUnreadNotifications(mockReq);

      expect(notificationService.getUnreadNotifications).toHaveBeenCalledWith(
        patientId,
        UserRole.USER,
      );
      expect(result).toEqual({ notifications: { data: [] } });
    });

    it('works for DOCTOR role', async () => {
      const mockReq = {
        user: {
          entity: { _id: new Types.ObjectId(doctorId) },
          role: UserRole.DOCTOR,
        },
      };

      await controller.getUnreadNotifications(mockReq);

      expect(notificationService.getUnreadNotifications).toHaveBeenCalledWith(
        doctorId,
        UserRole.DOCTOR,
      );
    });
  });

  describe('getUnreadCount()', () => {
    it('returns count wrapped in object', async () => {
      const mockReq = {
        user: {
          entity: { _id: new Types.ObjectId(patientId) },
          role: UserRole.USER,
        },
      };

      const result = await controller.getUnreadCount(mockReq);

      expect(notificationService.getUnreadCount).toHaveBeenCalledWith(
        patientId,
        UserRole.USER,
      );
      expect(result).toEqual({ count: 3 });
    });
  });

  describe('markAsRead()', () => {
    it('marks a notification as read and returns success message', async () => {
      const notificationId = new Types.ObjectId().toString();

      const result = await controller.markAsRead(notificationId);

      expect(notificationService.markAsRead).toHaveBeenCalledWith(
        notificationId,
      );
      expect(result).toEqual({ message: 'Notification marked as read' });
    });
  });

  describe('markAllAsRead()', () => {
    it('marks all notifications as read and returns success message', async () => {
      const mockReq = {
        user: {
          entity: { _id: new Types.ObjectId(patientId) },
          role: UserRole.USER,
        },
      };

      const result = await controller.markAllAsRead(mockReq);

      expect(notificationService.markAllAsRead).toHaveBeenCalledWith(
        patientId,
        UserRole.USER,
      );
      expect(result).toEqual({
        message: 'All notifications marked as read',
      });
    });
  });
});
