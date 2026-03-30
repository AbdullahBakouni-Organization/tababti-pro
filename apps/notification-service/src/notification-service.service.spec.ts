import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { NotificationService } from './notification-service.service';
import { Notification } from '@app/common/database/schemas/notification.schema';
import { FcmService } from '@app/common/fcm';
import { createMockFcmService, createMockModel } from '@app/common/testing';
import {
  NotificationStatus,
  UserRole,
} from '@app/common/database/schemas/common.enums';

describe('NotificationService', () => {
  let service: NotificationService;
  let fcmService: ReturnType<typeof createMockFcmService>;
  let notificationModel: ReturnType<typeof createMockModel>;

  const patientId = new Types.ObjectId().toString();
  const doctorId = new Types.ObjectId().toString();
  const bookingId = new Types.ObjectId().toString();

  const baseEvent = {
    data: {
      patientId,
      doctorId,
      bookingId,
      doctorName: 'Dr. Ahmad',
      patientName: 'Ali Hassan',
      fcmToken: 'test-fcm-token',
      appointmentDate: new Date().toISOString(),
      appointmentTime: '10:00',
      reason: 'Doctor requested',
      type: 'DOCTOR_CANCELLED' as const,
    },
  };

  beforeEach(async () => {
    fcmService = createMockFcmService();
    notificationModel = createMockModel();

    notificationModel.create.mockResolvedValue({
      _id: new Types.ObjectId(),
      isRead: false,
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationService,
        { provide: FcmService, useValue: fcmService },
        {
          provide: getModelToken(Notification.name),
          useValue: notificationModel,
        },
      ],
    }).compile();

    service = module.get<NotificationService>(NotificationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─── sendCancelledNotification ────────────────────────────────────────────

  describe('sendCancelledNotification()', () => {
    it('sends FCM and saves SENT record to database', async () => {
      fcmService.sendBookingCancellationNotification.mockResolvedValue(true);

      await service.sendCancelledNotification(baseEvent as any);

      expect(
        fcmService.sendBookingCancellationNotification,
      ).toHaveBeenCalledWith('test-fcm-token', baseEvent.data);
      expect(notificationModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ status: NotificationStatus.SENT }),
      );
    });

    it('saves FAILED record when FCM returns false', async () => {
      fcmService.sendBookingCancellationNotification.mockResolvedValue(false);

      await service.sendCancelledNotification(baseEvent as any);

      expect(notificationModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ status: NotificationStatus.FAILED }),
      );
    });

    it('saves FAILED record to database even when FCM throws', async () => {
      fcmService.sendBookingCancellationNotification.mockRejectedValue(
        new Error('FCM service unavailable'),
      );

      await expect(
        service.sendCancelledNotification(baseEvent as any),
      ).resolves.not.toThrow();

      expect(notificationModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ status: NotificationStatus.FAILED }),
      );
    });

    it('saves notification with correct recipientType USER', async () => {
      fcmService.sendBookingCancellationNotification.mockResolvedValue(true);

      await service.sendCancelledNotification(baseEvent as any);

      expect(notificationModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ recipientType: UserRole.USER }),
      );
    });
  });

  // ─── sendCancelledNotificationToDoctor ───────────────────────────────────

  describe('sendCancelledNotificationToDoctor()', () => {
    it('sends FCM to doctor and saves record with DOCTOR recipientType', async () => {
      fcmService.sendBookingCancellationNotificationToDoctor.mockResolvedValue(
        true,
      );

      await service.sendCancelledNotificationToDoctor(baseEvent as any);

      expect(
        fcmService.sendBookingCancellationNotificationToDoctor,
      ).toHaveBeenCalled();
      expect(notificationModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ recipientType: UserRole.DOCTOR }),
      );
    });

    it('saves FAILED record when FCM throws', async () => {
      fcmService.sendBookingCancellationNotificationToDoctor.mockRejectedValue(
        new Error('FCM error'),
      );

      await expect(
        service.sendCancelledNotificationToDoctor(baseEvent as any),
      ).resolves.not.toThrow();

      expect(notificationModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ status: NotificationStatus.FAILED }),
      );
    });
  });

  // ─── sendCompletedNotificationToPatient ──────────────────────────────────

  describe('sendCompletedNotificationToPatient()', () => {
    const completedEvent = {
      data: {
        ...baseEvent.data,
        notes: 'Take medication X',
        type: 'BOOKING_COMPLETED',
      },
    };

    it('sends FCM and saves SENT record', async () => {
      fcmService.sendBookingCompletionNotification.mockResolvedValue(true);

      await service.sendCompletedNotificationToPatient(completedEvent as any);

      expect(fcmService.sendBookingCompletionNotification).toHaveBeenCalled();
      expect(notificationModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ status: NotificationStatus.SENT }),
      );
    });

    it('saves FAILED record when FCM throws', async () => {
      fcmService.sendBookingCompletionNotification.mockRejectedValue(
        new Error('error'),
      );

      await expect(
        service.sendCompletedNotificationToPatient(completedEvent as any),
      ).resolves.not.toThrow();

      expect(notificationModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ status: NotificationStatus.FAILED }),
      );
    });
  });

  // ─── sendAdminApprovedPostNotification ───────────────────────────────────

  describe('sendAdminApprovedPostNotification()', () => {
    const adminPostEvent = {
      data: {
        doctorId,
        doctorName: 'Dr. Ahmad',
        fcmToken: 'token',
        postId: new Types.ObjectId().toString(),
        eventType: 'ADMIN_APPROVED_POST',
      },
    };

    it('sends FCM and saves record with DOCTOR recipientType', async () => {
      fcmService.sendAdminApprovedPostNotification.mockResolvedValue(true);

      await service.sendAdminApprovedPostNotification(adminPostEvent as any);

      expect(fcmService.sendAdminApprovedPostNotification).toHaveBeenCalled();
      expect(notificationModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ recipientType: UserRole.DOCTOR }),
      );
    });
  });

  // ─── sendRescheduledNotificationToPatient ────────────────────────────────

  describe('sendRescheduledNotificationToPatient()', () => {
    const rescheduledEvent = {
      data: {
        ...baseEvent.data,
        type: 'BOOKING_RESCHEDULED',
        reason: 'Doctor unavailable',
      },
    };

    it('sends FCM and saves SENT record', async () => {
      fcmService.sendBookingRescheduledNotification.mockResolvedValue(true);

      await service.sendRescheduledNotificationToPatient(rescheduledEvent as any);

      expect(fcmService.sendBookingRescheduledNotification).toHaveBeenCalled();
      expect(notificationModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ status: NotificationStatus.SENT }),
      );
    });

    it('saves FAILED record when FCM throws', async () => {
      fcmService.sendBookingRescheduledNotification.mockRejectedValue(
        new Error('FCM error'),
      );

      await expect(
        service.sendRescheduledNotificationToPatient(rescheduledEvent as any),
      ).resolves.not.toThrow();

      expect(notificationModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ status: NotificationStatus.FAILED }),
      );
    });
  });

  // ─── sendAdminRejectedPostNotification ───────────────────────────────────

  describe('sendAdminRejectedPostNotification()', () => {
    const adminRejectedEvent = {
      data: {
        doctorId,
        doctorName: 'Dr. Ahmad',
        fcmToken: 'token',
        postId: 'post-1',
        reason: 'Inappropriate content',
      },
    };

    it('sends FCM and saves DOCTOR record', async () => {
      fcmService.sendAdminRejectedPostNotification.mockResolvedValue(true);

      await service.sendAdminRejectedPostNotification(adminRejectedEvent as any);

      expect(fcmService.sendAdminRejectedPostNotification).toHaveBeenCalled();
      expect(notificationModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ recipientType: UserRole.DOCTOR }),
      );
    });

    it('saves FAILED record when FCM throws', async () => {
      fcmService.sendAdminRejectedPostNotification.mockRejectedValue(
        new Error('FCM error'),
      );

      await expect(
        service.sendAdminRejectedPostNotification(adminRejectedEvent as any),
      ).resolves.not.toThrow();

      expect(notificationModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ status: NotificationStatus.FAILED }),
      );
    });
  });

  // ─── sendAdminApprovedGalleryNotification ─────────────────────────────────

  describe('sendAdminApprovedGalleryNotification()', () => {
    const galleryEvent = {
      data: {
        doctorId,
        doctorName: 'Dr. Ahmad',
        fcmToken: 'token',
        GalleryIds: ['img-1', 'img-2'],
      },
    };

    it('sends FCM and saves record', async () => {
      fcmService.sendAdminApprovedGalleryImagesNotification.mockResolvedValue(true);

      await service.sendAdminApprovedGalleryNotification(galleryEvent as any);

      expect(
        fcmService.sendAdminApprovedGalleryImagesNotification,
      ).toHaveBeenCalled();
      expect(notificationModel.create).toHaveBeenCalled();
    });

    it('saves FAILED record when FCM throws', async () => {
      fcmService.sendAdminApprovedGalleryImagesNotification.mockRejectedValue(
        new Error('FCM error'),
      );

      await expect(
        service.sendAdminApprovedGalleryNotification(galleryEvent as any),
      ).resolves.not.toThrow();

      expect(notificationModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ status: NotificationStatus.FAILED }),
      );
    });
  });

  // ─── sendAdminRejectedGalleryNotification ─────────────────────────────────

  describe('sendAdminRejectedGalleryNotification()', () => {
    const rejectedGalleryEvent = {
      data: {
        doctorId,
        doctorName: 'Dr. Ahmad',
        fcmToken: 'token',
        GalleryIds: ['img-1'],
        rejectionReason: 'Too blurry',
      },
    };

    it('sends FCM and saves record', async () => {
      fcmService.sendAdminRejectedGalleryImagesNotification.mockResolvedValue(true);

      await service.sendAdminRejectedGalleryNotification(rejectedGalleryEvent as any);

      expect(
        fcmService.sendAdminRejectedGalleryImagesNotification,
      ).toHaveBeenCalled();
      expect(notificationModel.create).toHaveBeenCalled();
    });

    it('saves FAILED record when FCM throws', async () => {
      fcmService.sendAdminRejectedGalleryImagesNotification.mockRejectedValue(
        new Error('FCM error'),
      );

      await expect(
        service.sendAdminRejectedGalleryNotification(rejectedGalleryEvent as any),
      ).resolves.not.toThrow();

      expect(notificationModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ status: NotificationStatus.FAILED }),
      );
    });
  });

  // ─── sendAdminApprovedUserQuestionsNotification ───────────────────────────

  describe('sendAdminApprovedUserQuestionsNotification()', () => {
    const questionsEvent = {
      data: {
        userId: patientId,
        userName: 'Ali',
        fcmToken: 'token',
        questionIds: ['q1', 'q2'],
      },
    };

    it('sends FCM and saves USER record', async () => {
      fcmService.sendAdminApprovedUserQuestionsNotification.mockResolvedValue(true);

      await service.sendAdminApprovedUserQuestionsNotification(questionsEvent as any);

      expect(
        fcmService.sendAdminApprovedUserQuestionsNotification,
      ).toHaveBeenCalled();
      expect(notificationModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ recipientType: UserRole.USER }),
      );
    });

    it('saves FAILED record when FCM throws', async () => {
      fcmService.sendAdminApprovedUserQuestionsNotification.mockRejectedValue(
        new Error('FCM error'),
      );

      await expect(
        service.sendAdminApprovedUserQuestionsNotification(questionsEvent as any),
      ).resolves.not.toThrow();

      expect(notificationModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ status: NotificationStatus.FAILED }),
      );
    });
  });

  // ─── sendAdminRejectedUserQuestionsNotification ───────────────────────────

  describe('sendAdminRejectedUserQuestionsNotification()', () => {
    const rejectedQuestionsEvent = {
      data: {
        userId: patientId,
        userName: 'Ali',
        fcmToken: 'token',
        questionIds: ['q1'],
        rejectionReason: 'Off-topic',
      },
    };

    it('sends FCM and saves USER record', async () => {
      fcmService.sendAdminRejectedUserQuestionsNotification.mockResolvedValue(true);

      await service.sendAdminRejectedUserQuestionsNotification(
        rejectedQuestionsEvent as any,
      );

      expect(
        fcmService.sendAdminRejectedUserQuestionsNotification,
      ).toHaveBeenCalled();
      expect(notificationModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ recipientType: UserRole.USER }),
      );
    });

    it('saves FAILED record when FCM throws', async () => {
      fcmService.sendAdminRejectedUserQuestionsNotification.mockRejectedValue(
        new Error('FCM error'),
      );

      await expect(
        service.sendAdminRejectedUserQuestionsNotification(
          rejectedQuestionsEvent as any,
        ),
      ).resolves.not.toThrow();

      expect(notificationModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ status: NotificationStatus.FAILED }),
      );
    });
  });

  // ─── getUnreadNotifications ───────────────────────────────────────────────

  describe('getUnreadNotifications()', () => {
    it('returns unread notifications sorted by createdAt desc', async () => {
      const mockNotifications = [
        { _id: new Types.ObjectId(), isRead: false, createdAt: new Date() },
      ];

      notificationModel.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(mockNotifications),
      });

      const result = await service.getUnreadNotifications(
        patientId,
        UserRole.USER,
      );

      expect(result.notifications.data).toEqual(mockNotifications);
      expect(notificationModel.find).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientType: UserRole.USER,
          isRead: false,
        }),
      );
    });
  });

  // ─── markAsRead ───────────────────────────────────────────────────────────

  describe('markAsRead()', () => {
    it('sets isRead to true on the notification', async () => {
      const notifId = new Types.ObjectId().toString();
      notificationModel.findByIdAndUpdate.mockResolvedValue(undefined);

      await service.markAsRead(notifId);

      expect(notificationModel.findByIdAndUpdate).toHaveBeenCalledWith(
        notifId,
        { $set: { isRead: true } },
      );
    });
  });

  // ─── markAllAsRead ────────────────────────────────────────────────────────

  describe('markAllAsRead()', () => {
    it('marks all unread notifications as read for recipient', async () => {
      notificationModel.updateMany.mockResolvedValue({ modifiedCount: 5 });

      await service.markAllAsRead(patientId, UserRole.USER);

      expect(notificationModel.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientType: UserRole.USER,
          isRead: false,
        }),
        { $set: { isRead: true } },
      );
    });
  });

  // ─── getUnreadCount ───────────────────────────────────────────────────────

  describe('getUnreadCount()', () => {
    it('returns count of unread notifications', async () => {
      notificationModel.countDocuments.mockResolvedValue(7);

      const count = await service.getUnreadCount(patientId, UserRole.USER);

      expect(count).toBe(7);
      expect(notificationModel.countDocuments).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientType: UserRole.USER,
          isRead: false,
        }),
      );
    });
  });
});
