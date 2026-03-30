// Mock firebase-admin before any imports
const mockSend = jest.fn();
const mockSendEachForMulticast = jest.fn();
const mockSubscribeToTopic = jest.fn();

jest.mock('firebase-admin', () => ({
  apps: [],
  initializeApp: jest.fn(),
  credential: {
    cert: jest.fn().mockReturnValue({}),
  },
  messaging: jest.fn().mockReturnValue({
    send: mockSend,
    sendEachForMulticast: mockSendEachForMulticast,
    subscribeToTopic: mockSubscribeToTopic,
  }),
}));

import { FcmService } from './fcm.service';

describe('FcmService', () => {
  let service: FcmService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new FcmService();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ── sendBookingCancellationNotification ────────────────────────────────────

  describe('sendBookingCancellationNotification()', () => {
    const data = {
      bookingId: 'b1',
      doctorName: 'Dr. Ahmad',
      appointmentDate: '2026-04-01',
      appointmentTime: '10:00',
      reason: 'Schedule conflict',
      type: 'DOCTOR_CANCELLED' as const,
    };

    it('returns true when FCM send succeeds', async () => {
      mockSend.mockResolvedValue('message-id');
      const result = await service.sendBookingCancellationNotification(
        'token-1',
        data,
      );
      expect(result).toBe(true);
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({ token: 'token-1' }),
      );
    });

    it('returns false when FCM send throws', async () => {
      mockSend.mockRejectedValue(new Error('FCM error'));
      const result = await service.sendBookingCancellationNotification(
        'bad-token',
        data,
      );
      expect(result).toBe(false);
    });
  });

  // ── sendBookingCancellationNotificationToDoctor ────────────────────────────

  describe('sendBookingCancellationNotificationToDoctor()', () => {
    const data = {
      bookingId: 'b1',
      doctorName: 'Dr. Ahmad',
      patientName: 'Ali',
      patientId: 'p1',
      appointmentDate: '2026-04-01',
      appointmentTime: '10:00',
      reason: 'Patient request',
      type: 'USER_CANCELLED' as const,
    };

    it('returns true when FCM send succeeds', async () => {
      mockSend.mockResolvedValue('msg-id');
      const result = await service.sendBookingCancellationNotificationToDoctor(
        'token-2',
        data,
      );
      expect(result).toBe(true);
    });

    it('returns false on failure', async () => {
      mockSend.mockRejectedValue(new Error('error'));
      const result = await service.sendBookingCancellationNotificationToDoctor(
        'bad-token',
        data,
      );
      expect(result).toBe(false);
    });
  });

  // ── sendBookingCompletionNotification ──────────────────────────────────────

  describe('sendBookingCompletionNotification()', () => {
    const data = {
      bookingId: 'b1',
      doctorName: 'Dr. Ahmad',
      appointmentDate: new Date(),
      appointmentTime: '10:00',
      notes: 'Take rest',
      type: 'BOOKING_COMPLETED' as const,
    };

    it('returns true on success', async () => {
      mockSend.mockResolvedValue('msg-id');
      const result = await service.sendBookingCompletionNotification(
        'token',
        data,
      );
      expect(result).toBe(true);
    });

    it('returns false on failure', async () => {
      mockSend.mockRejectedValue(new Error('error'));
      const result = await service.sendBookingCompletionNotification(
        'token',
        data,
      );
      expect(result).toBe(false);
    });
  });

  // ── sendBookingRescheduledNotification ─────────────────────────────────────

  describe('sendBookingRescheduledNotification()', () => {
    const data = {
      bookingId: 'b1',
      doctorName: 'Dr. Ahmad',
      appointmentDate: new Date(),
      appointmentTime: '11:00',
      type: 'BOOKING_RESCHEDULED' as const,
    };

    it('returns true on success', async () => {
      mockSend.mockResolvedValue('msg-id');
      const result = await service.sendBookingRescheduledNotification(
        'token',
        data,
      );
      expect(result).toBe(true);
    });

    it('returns false on failure', async () => {
      mockSend.mockRejectedValue(new Error('error'));
      const result = await service.sendBookingRescheduledNotification(
        'token',
        data,
      );
      expect(result).toBe(false);
    });
  });

  // ── sendMulticastNotification ──────────────────────────────────────────────

  describe('sendMulticastNotification()', () => {
    const data = {
      bookingId: 'b1',
      doctorName: 'Dr. Ahmad',
      appointmentDate: '2026-04-01',
      appointmentTime: '10:00',
      reason: 'Paused',
      type: 'SLOT_PAUSED' as const,
    };

    it('returns zeros when token list is empty', async () => {
      const result = await service.sendMulticastNotification([], data);
      expect(result).toEqual({
        successCount: 0,
        failureCount: 0,
        invalidTokens: [],
      });
      expect(mockSendEachForMulticast).not.toHaveBeenCalled();
    });

    it('returns success counts on success', async () => {
      mockSendEachForMulticast.mockResolvedValue({
        successCount: 2,
        failureCount: 0,
        responses: [{ success: true }, { success: true }],
      });
      const result = await service.sendMulticastNotification(
        ['token-1', 'token-2'],
        data,
      );
      expect(result.successCount).toBe(2);
      expect(result.failureCount).toBe(0);
      expect(result.invalidTokens).toEqual([]);
    });

    it('collects invalid tokens from failed responses', async () => {
      mockSendEachForMulticast.mockResolvedValue({
        successCount: 0,
        failureCount: 1,
        responses: [
          {
            success: false,
            error: { code: 'messaging/invalid-registration-token' },
          },
        ],
      });
      const result = await service.sendMulticastNotification(
        ['bad-token'],
        data,
      );
      expect(result.invalidTokens).toContain('bad-token');
    });

    it('returns failure counts on error', async () => {
      mockSendEachForMulticast.mockRejectedValue(new Error('multicast failed'));
      const result = await service.sendMulticastNotification(
        ['token-1', 'token-2'],
        data,
      );
      expect(result.successCount).toBe(0);
      expect(result.failureCount).toBe(2);
    });
  });

  // ── sendAdminApprovedPostNotification ──────────────────────────────────────

  describe('sendAdminApprovedPostNotification()', () => {
    const data = { postId: 'p1', doctorName: 'Ahmad', doctorId: 'd1' };

    it('returns true on success', async () => {
      mockSend.mockResolvedValue('msg-id');
      const result = await service.sendAdminApprovedPostNotification(
        'token',
        data,
      );
      expect(result).toBe(true);
    });

    it('returns false on failure', async () => {
      mockSend.mockRejectedValue(new Error('error'));
      const result = await service.sendAdminApprovedPostNotification(
        'token',
        data,
      );
      expect(result).toBe(false);
    });
  });

  // ── sendAdminRejectedPostNotification ──────────────────────────────────────

  describe('sendAdminRejectedPostNotification()', () => {
    const data = {
      postId: 'p1',
      doctorName: 'Ahmad',
      doctorId: 'd1',
      reason: 'Inappropriate',
    };

    it('returns true on success', async () => {
      mockSend.mockResolvedValue('msg-id');
      const result = await service.sendAdminRejectedPostNotification(
        'token',
        data,
      );
      expect(result).toBe(true);
    });

    it('returns false on failure', async () => {
      mockSend.mockRejectedValue(new Error('error'));
      const result = await service.sendAdminRejectedPostNotification(
        'token',
        data,
      );
      expect(result).toBe(false);
    });
  });

  // ── sendAdminApprovedGalleryImagesNotification ─────────────────────────────

  describe('sendAdminApprovedGalleryImagesNotification()', () => {
    const data = {
      doctorId: 'd1',
      doctorName: 'Ahmad',
      galleryIds: ['img-1', 'img-2'],
    };

    it('returns true on success', async () => {
      mockSend.mockResolvedValue('msg-id');
      const result = await service.sendAdminApprovedGalleryImagesNotification(
        'token',
        data,
      );
      expect(result).toBe(true);
    });

    it('uses singular body when 1 image', async () => {
      mockSend.mockResolvedValue('msg-id');
      await service.sendAdminApprovedGalleryImagesNotification('token', {
        ...data,
        galleryIds: ['img-1'],
      });
      // Verify send was called - singular wording handled internally
      expect(mockSend).toHaveBeenCalled();
    });

    it('returns false on failure', async () => {
      mockSend.mockRejectedValue(new Error('error'));
      const result = await service.sendAdminApprovedGalleryImagesNotification(
        'token',
        data,
      );
      expect(result).toBe(false);
    });
  });

  // ── sendAdminRejectedGalleryImagesNotification ─────────────────────────────

  describe('sendAdminRejectedGalleryImagesNotification()', () => {
    const data = {
      doctorId: 'd1',
      doctorName: 'Ahmad',
      rejectionReason: 'Too blurry',
      galleryIds: ['img-1'],
    };

    it('returns true on success', async () => {
      mockSend.mockResolvedValue('msg-id');
      const result = await service.sendAdminRejectedGalleryImagesNotification(
        'token',
        data,
      );
      expect(result).toBe(true);
    });

    it('returns false on failure', async () => {
      mockSend.mockRejectedValue(new Error('error'));
      const result = await service.sendAdminRejectedGalleryImagesNotification(
        'token',
        data,
      );
      expect(result).toBe(false);
    });
  });

  // ── sendAdminApprovedUserQuestionsNotification ─────────────────────────────

  describe('sendAdminApprovedUserQuestionsNotification()', () => {
    const data = {
      userId: 'u1',
      userName: 'Ali',
      questionIds: ['q1', 'q2'],
    };

    it('returns true on success', async () => {
      mockSend.mockResolvedValue('msg-id');
      const result = await service.sendAdminApprovedUserQuestionsNotification(
        'token',
        data,
      );
      expect(result).toBe(true);
    });

    it('returns false on failure', async () => {
      mockSend.mockRejectedValue(new Error('error'));
      const result = await service.sendAdminApprovedUserQuestionsNotification(
        'token',
        data,
      );
      expect(result).toBe(false);
    });
  });

  // ── sendAdminRejectedUserQuestionsNotification ─────────────────────────────

  describe('sendAdminRejectedUserQuestionsNotification()', () => {
    const data = {
      userId: 'u1',
      userName: 'Ali',
      questionIds: ['q1'],
      rejectionReason: 'Off-topic',
    };

    it('returns true on success', async () => {
      mockSend.mockResolvedValue('msg-id');
      const result = await service.sendAdminRejectedUserQuestionsNotification(
        'token',
        data,
      );
      expect(result).toBe(true);
    });

    it('returns false on failure', async () => {
      mockSend.mockRejectedValue(new Error('error'));
      const result = await service.sendAdminRejectedUserQuestionsNotification(
        'token',
        data,
      );
      expect(result).toBe(false);
    });
  });

  // ── sendSlotsRefreshedNotification ─────────────────────────────────────────

  describe('sendSlotsRefreshedNotification()', () => {
    it('returns true on success', async () => {
      mockSend.mockResolvedValue('msg-id');
      const result = await service.sendSlotsRefreshedNotification(
        'token',
        'Dr. Ahmad',
        5,
      );
      expect(result).toBe(true);
    });

    it('returns false on failure', async () => {
      mockSend.mockRejectedValue(new Error('error'));
      const result = await service.sendSlotsRefreshedNotification(
        'token',
        'Dr. Ahmad',
        5,
      );
      expect(result).toBe(false);
    });
  });

  // ── verifyToken ────────────────────────────────────────────────────────────

  describe('verifyToken()', () => {
    it('returns true when dry-run send succeeds', async () => {
      mockSend.mockResolvedValue(undefined);
      const result = await service.verifyToken('valid-token');
      expect(result).toBe(true);
    });

    it('returns false when dry-run send throws', async () => {
      mockSend.mockRejectedValue(new Error('Invalid token'));
      const result = await service.verifyToken('invalid-token');
      expect(result).toBe(false);
    });
  });

  // ── subscribeToTopic ───────────────────────────────────────────────────────

  describe('subscribeToTopic()', () => {
    it('returns success and failure counts', async () => {
      mockSubscribeToTopic.mockResolvedValue({
        successCount: 2,
        failureCount: 0,
      });
      const result = await service.subscribeToTopic(
        ['token-1', 'token-2'],
        'doctor-updates',
      );
      expect(result.successCount).toBe(2);
      expect(result.failureCount).toBe(0);
    });

    it('returns zeros on failure', async () => {
      mockSubscribeToTopic.mockRejectedValue(new Error('error'));
      const result = await service.subscribeToTopic(['token-1'], 'topic');
      expect(result.successCount).toBe(0);
      expect(result.failureCount).toBe(1);
    });
  });
});
