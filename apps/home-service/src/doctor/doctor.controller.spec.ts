jest.mock('@app/common/database/schemas/sub-cities.schema', () => ({
  SubCities: { DAMASCUS: 'DAMASCUS' },
  SubCitiesSchema: {},
}));

import { Test, TestingModule } from '@nestjs/testing';
import { DoctorController } from './doctor.controller';
import { DoctorService } from './doctor.service';
import { DoctorBookingsQueryService } from './doctor.service.v2';
import { AuthValidateService } from '../../../../libs/common/src/auth-validate/auth-validate.service';
import { MinioService } from '@app/common/file-storage';
import { Types } from 'mongoose';

describe('DoctorController', () => {
  let controller: DoctorController;
  const realDoctorId = new Types.ObjectId();
  const realAuthAccountId = new Types.ObjectId();

  const makeReq = (overrides: Record<string, unknown> = {}) => ({
    user: {
      entity: { _id: { toString: () => realDoctorId.toString() } },
      accountId: realAuthAccountId.toString(),
      sessionId: 'session-1',
      role: 'doctor',
    },
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
    headers: { 'user-agent': 'test' },
    ...overrides,
  });

  const mockRes = {
    cookie: jest.fn(),
  };

  const mockDoctorService = {
    registerDoctor: jest.fn(),
    updateDoctorFiles: jest.fn(),
    deleteDoctorRecord: jest.fn(),
    loginDoctor: jest.fn(),
    requestPasswordResetOtp: jest.fn(),
    verifyPasswordResetOtp: jest.fn(),
    resetPassword: jest.fn(),
    doctorCancelBooking: jest.fn(),
    checkPauseConflicts: jest.fn(),
    pauseSlots: jest.fn(),
    getAllSlots: jest.fn(),
    checkVIPBookingConflict: jest.fn(),
    createVIPBooking: jest.fn(),
    checkHolidayConflict: jest.fn(),
    createHoliday: jest.fn(),
    isApprovedDoctorByPhone: jest.fn(),
    updateDoctorFCMToken: jest.fn(),
    completeBooking: jest.fn(),
    getDoctorPatientGenderStats: jest.fn(),
    getDoctorPatientGenderWeekly: jest.fn(),
    searchDoctors: jest.fn(),
  };

  const mockDoctorServiceV2 = {
    rescheduleBooking: jest.fn(),
    getDoctorBookings: jest.fn(),
  };

  const mockAuthService = {
    createSession: jest.fn(),
    getActiveSessions: jest.fn(),
    logoutSession: jest.fn(),
    logoutDevice: jest.fn(),
    logoutAllSessions: jest.fn(),
    refreshTokens: jest.fn(),
  };

  const mockMinioService = {
    uploadFile: jest.fn(),
    deleteFile: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DoctorController],
      providers: [
        { provide: DoctorService, useValue: mockDoctorService },
        { provide: DoctorBookingsQueryService, useValue: mockDoctorServiceV2 },
        { provide: AuthValidateService, useValue: mockAuthService },
        { provide: MinioService, useValue: mockMinioService },
      ],
    }).compile();

    controller = module.get<DoctorController>(DoctorController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ─── signIn ──────────────────────────────────────────────────────────────────

  describe('signIn()', () => {
    const dto = {
      phone: '0911111111',
      password: 'pass123',
      deviceInfo: {
        deviceId: 'dev-1',
        deviceName: 'iPhone',
        deviceType: 'mobile' as const,
        platform: 'ios' as const,
      },
    };

    it('logs in doctor and creates session', async () => {
      const mockDoctor = {
        _id: realDoctorId,
        authAccountId: realAuthAccountId,
        firstName: 'Ali',
        lastName: 'Mahmoud',
        phones: [{ normal: ['0911111111'] }],
        gender: 'male',
        image: 'img.png',
      };
      mockDoctorService.loginDoctor.mockResolvedValue(mockDoctor);
      mockAuthService.createSession.mockResolvedValue({
        accessToken: 'at',
        refreshToken: 'rt',
      });

      const result = await controller.signIn(
        dto,
        mockRes as any,
        makeReq() as any,
      );

      expect(mockDoctorService.loginDoctor).toHaveBeenCalledWith(dto);
      expect(mockAuthService.createSession).toHaveBeenCalled();
      expect(result.accessToken).toBe('at');
      expect(result.doctor.fullName).toBe('Ali Mahmoud');
      expect(mockRes.cookie).toHaveBeenCalledWith(
        'token',
        'rt',
        expect.objectContaining({ httpOnly: true }),
      );
    });
  });

  // ─── requestPasswordResetOtp ─────────────────────────────────────────────────

  describe('requestPasswordResetOtp()', () => {
    it('delegates to DoctorService', async () => {
      const dto = { phone: '0911111111' } as any;
      mockDoctorService.requestPasswordResetOtp.mockResolvedValue({
        success: true,
      });

      const result = await controller.requestPasswordResetOtp(dto);

      expect(mockDoctorService.requestPasswordResetOtp).toHaveBeenCalledWith(
        dto,
      );
      expect(result).toEqual({ success: true });
    });
  });

  // ─── getActiveSessions ──────────────────────────────────────────────────────

  describe('getActiveSessions()', () => {
    it('returns sessions from authService', async () => {
      mockAuthService.getActiveSessions.mockResolvedValue(['s1', 's2']);

      const result = await controller.getActiveSessions(makeReq());

      expect(result.total).toBe(2);
      expect(result.sessions).toEqual(['s1', 's2']);
    });
  });

  // ─── logout ─────────────────────────────────────────────────────────────────

  describe('logout()', () => {
    it('calls logoutSession and returns message', async () => {
      mockAuthService.logoutSession.mockResolvedValue(undefined);

      const result = await controller.logout(makeReq());

      expect(mockAuthService.logoutSession).toHaveBeenCalledWith(
        realAuthAccountId.toString(),
        'doctor',
        'session-1',
      );
      expect(result.message).toBe('Logged out successfully');
    });
  });

  // ─── logoutDevice ───────────────────────────────────────────────────────────

  describe('logoutDevice()', () => {
    it('calls logoutDevice with deviceId', async () => {
      mockAuthService.logoutDevice.mockResolvedValue(undefined);

      const result = await controller.logoutDevice(makeReq(), 'dev-1');

      expect(mockAuthService.logoutDevice).toHaveBeenCalledWith(
        realAuthAccountId.toString(),
        'doctor',
        'dev-1',
      );
      expect(result.message).toContain('dev-1');
    });
  });

  // ─── logoutAll ──────────────────────────────────────────────────────────────

  describe('logoutAll()', () => {
    it('calls logoutAllSessions and clears cookie', async () => {
      mockAuthService.logoutAllSessions.mockResolvedValue(undefined);

      const result = await controller.logoutAll(makeReq(), mockRes as any);

      expect(mockAuthService.logoutAllSessions).toHaveBeenCalledWith(
        realAuthAccountId.toString(),
        'doctor',
      );
      expect(mockRes.cookie).toHaveBeenCalledWith(
        'token',
        '',
        expect.objectContaining({ httpOnly: true }),
      );
      expect(result.message).toBe('Logged out from all devices');
    });
  });

  // ─── cancelBooking ──────────────────────────────────────────────────────────

  describe('cancelBooking()', () => {
    it('delegates to DoctorService with parsed doctorId', async () => {
      const dto = {
        bookingId: new Types.ObjectId().toString(),
        reason: 'busy',
      } as any;
      mockDoctorService.doctorCancelBooking.mockResolvedValue({
        cancelled: true,
      });

      const result = await controller.cancelBooking(dto, makeReq());

      expect(mockDoctorService.doctorCancelBooking).toHaveBeenCalledWith(
        dto,
        realDoctorId.toString(),
      );
      expect(result).toEqual({ cancelled: true });
    });
  });

  // ─── checkDoctorByPhone ─────────────────────────────────────────────────────

  describe('checkDoctorByPhone()', () => {
    it('returns existence result', async () => {
      mockDoctorService.isApprovedDoctorByPhone.mockResolvedValue({
        exists: true,
        approved: true,
      });

      const result = await controller.checkDoctorByPhone({
        phone: '0911111111',
      } as any);

      expect(result).toEqual({ exists: true, approved: true });
    });
  });

  // ─── updateDoctorFCMToken ───────────────────────────────────────────────────

  describe('updateDoctorFCMToken()', () => {
    it('delegates to DoctorService', async () => {
      const dto = { fcmToken: 'token-abc' } as any;
      mockDoctorService.updateDoctorFCMToken.mockResolvedValue({
        updated: true,
      });

      const result = await controller.updateDoctorFCMToken(dto, makeReq());

      expect(mockDoctorService.updateDoctorFCMToken).toHaveBeenCalledWith(
        realDoctorId.toString(),
        'token-abc',
      );
      expect(result).toEqual({ updated: true });
    });
  });

  // ─── completeBooking ────────────────────────────────────────────────────────

  describe('completeBooking()', () => {
    it('delegates to DoctorService', async () => {
      const dto = { bookingId: new Types.ObjectId().toString() } as any;
      mockDoctorService.completeBooking.mockResolvedValue({ completed: true });

      const result = await controller.completeBooking(dto, makeReq());

      expect(mockDoctorService.completeBooking).toHaveBeenCalledWith(
        dto,
        realDoctorId.toString(),
      );
      expect(result).toEqual({ completed: true });
    });
  });

  // ─── getPatientGenderStats ──────────────────────────────────────────────────

  describe('getPatientGenderStats()', () => {
    it('returns stats from DoctorService', async () => {
      const stats = { male: 10, female: 5 };
      mockDoctorService.getDoctorPatientGenderStats.mockResolvedValue(stats);

      const result = await controller.getPatientGenderStats(makeReq());

      expect(result).toEqual(stats);
    });
  });

  // ─── getPatientGenderWeekly ─────────────────────────────────────────────────

  describe('getPatientGenderWeekly()', () => {
    it('wraps service result in { success, data } and forwards endDate', async () => {
      const serviceData = {
        period: { startDate: '2026-04-13', endDate: '2026-04-18' },
        days: [
          { day: 'Mo', date: '2026-04-13', male: 1, female: 2 },
          { day: 'Tu', date: '2026-04-14', male: 0, female: 0 },
          { day: 'We', date: '2026-04-15', male: 3, female: 0 },
          { day: 'Th', date: '2026-04-16', male: 0, female: 1 },
          { day: 'Fr', date: '2026-04-17', male: 0, female: 0 },
          { day: 'Sa', date: '2026-04-18', male: 4, female: 5 },
        ],
      };
      mockDoctorService.getDoctorPatientGenderWeekly.mockResolvedValue(
        serviceData,
      );

      const result = await controller.getPatientGenderWeekly(
        { endDate: '2026-04-18' },
        makeReq(),
      );

      expect(
        mockDoctorService.getDoctorPatientGenderWeekly,
      ).toHaveBeenCalledWith(realDoctorId.toString(), '2026-04-18');
      expect(result).toEqual({ success: true, data: serviceData });
    });

    it('passes undefined endDate when query is empty (service applies default)', async () => {
      mockDoctorService.getDoctorPatientGenderWeekly.mockResolvedValue({
        period: { startDate: '', endDate: '' },
        days: [],
      });

      await controller.getPatientGenderWeekly({}, makeReq());

      expect(
        mockDoctorService.getDoctorPatientGenderWeekly,
      ).toHaveBeenCalledWith(realDoctorId.toString(), undefined);
    });
  });

  // ─── rescheduleBooking ──────────────────────────────────────────────────────

  describe('rescheduleBooking()', () => {
    it('delegates to DoctorServiceV2', async () => {
      const dto = { bookingId: new Types.ObjectId().toString() } as any;
      mockDoctorServiceV2.rescheduleBooking.mockResolvedValue({
        rescheduled: true,
      });

      const result = await controller.rescheduleBooking(dto, makeReq());

      expect(mockDoctorServiceV2.rescheduleBooking).toHaveBeenCalledWith(
        realDoctorId.toString(),
        dto,
      );
      expect(result).toEqual({ rescheduled: true });
    });
  });
});
