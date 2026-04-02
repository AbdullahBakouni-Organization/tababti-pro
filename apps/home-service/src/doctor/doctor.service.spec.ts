import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { getModelToken, getConnectionToken } from '@nestjs/mongoose';
import { getQueueToken } from '@nestjs/bull';
import { Types } from 'mongoose';
import { DoctorService } from './doctor.service';
import { Doctor } from '@app/common/database/schemas/doctor.schema';
import { Otp } from '@app/common/database/schemas/otp.schema';
import { AppointmentSlot } from '@app/common/database/schemas/slot.schema';
import { AuthAccount } from '@app/common/database/schemas/auth.schema';
import { User } from '@app/common/database/schemas/user.schema';
import { Booking } from '@app/common/database/schemas/booking.schema';
import { KafkaService } from '@app/common/kafka/kafka.service';
import { CacheService } from '@app/common/cache/cache.service';
import { SmsService } from '../sms/sms.service';
import { ApprovalStatus } from '@app/common/database/schemas/common.enums';
import { createMockModel, createMockConnection } from '@app/common/testing';

describe('DoctorService', () => {
  let service: DoctorService;
  let doctorModel: ReturnType<typeof createMockModel>;
  let otpModel: ReturnType<typeof createMockModel>;
  let slotModel: ReturnType<typeof createMockModel>;
  let authModel: ReturnType<typeof createMockModel>;
  let userModel: ReturnType<typeof createMockModel>;
  let bookingModel: ReturnType<typeof createMockModel>;
  let connection: ReturnType<typeof createMockConnection>;

  const doctorId = new Types.ObjectId().toString();

  const mockSession = {
    startTransaction: jest.fn(),
    commitTransaction: jest.fn().mockResolvedValue(undefined),
    abortTransaction: jest.fn().mockResolvedValue(undefined),
    endSession: jest.fn().mockResolvedValue(undefined),
    inTransaction: jest.fn().mockReturnValue(true),
  };

  const mockDoctor = {
    _id: new Types.ObjectId(doctorId),
    phones: [{ normal: '+963912345678' }],
    status: ApprovalStatus.APPROVED,
    lockedUntil: null,
    lastLoginAt: null,
    maxSessions: 5,
    comparePassword: jest.fn().mockResolvedValue(true),
    incrementFailedAttempts: jest.fn(),
    resetFailedAttempts: jest.fn(),
    getActiveSessionsCount: jest.fn().mockReturnValue(0),
    save: jest.fn().mockResolvedValue(undefined),
  };

  const mockQueue = {
    add: jest.fn().mockResolvedValue({}),
    process: jest.fn(),
  };

  beforeEach(async () => {
    doctorModel = createMockModel();
    otpModel = createMockModel();
    slotModel = createMockModel();
    authModel = createMockModel();
    userModel = createMockModel();
    bookingModel = createMockModel();
    connection = createMockConnection();

    (doctorModel as any).db = {
      startSession: jest.fn().mockResolvedValue(mockSession),
    };
    (bookingModel as any).db = {
      startSession: jest.fn().mockResolvedValue(mockSession),
    };
    mockDoctor.save.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DoctorService,
        { provide: getModelToken(Doctor.name), useValue: doctorModel },
        { provide: getModelToken(Otp.name), useValue: otpModel },
        { provide: getModelToken(AppointmentSlot.name), useValue: slotModel },
        { provide: getModelToken(AuthAccount.name), useValue: authModel },
        { provide: getModelToken(User.name), useValue: userModel },
        { provide: getModelToken(Booking.name), useValue: bookingModel },
        { provide: getConnectionToken(), useValue: connection },
        {
          provide: KafkaService,
          useValue: { emit: jest.fn(), send: jest.fn() },
        },
        {
          provide: SmsService,
          useValue: {
            generateOTP: jest.fn().mockReturnValue('123456'),
            sendOTP: jest.fn(),
          },
        },
        {
          provide: CacheService,
          useValue: {
            get: jest.fn().mockResolvedValue(null),
            set: jest.fn(),
            invalidate: jest.fn(),
            invalidatePattern: jest.fn(),
          },
        },
        { provide: getQueueToken('pause-slots'), useValue: mockQueue },
        { provide: getQueueToken('vip-booking'), useValue: mockQueue },
        { provide: getQueueToken('holiday-block'), useValue: mockQueue },
      ],
    }).compile();

    service = module.get<DoctorService>(DoctorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─── loginDoctor ───────────────────────────────────────────────────────────

  describe('loginDoctor()', () => {
    it('returns doctor on successful login', async () => {
      doctorModel.findOne.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        session: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(mockDoctor),
      });

      const result = await service.loginDoctor({
        phone: '+963912345678',
        password: 'pass',
      } as any);

      expect(result).toBe(mockDoctor);
      expect(mockDoctor.resetFailedAttempts).toHaveBeenCalled();
    });

    it('throws BadRequestException when phone or password missing', async () => {
      await expect(
        service.loginDoctor({ phone: '', password: '' } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws UnauthorizedException when doctor not found', async () => {
      doctorModel.findOne.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        session: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(
        service.loginDoctor({ phone: '+963999', password: 'pass' } as any),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when account not approved', async () => {
      doctorModel.findOne.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        session: jest.fn().mockReturnThis(),
        exec: jest
          .fn()
          .mockResolvedValue({ ...mockDoctor, status: ApprovalStatus.PENDING }),
      });

      await expect(
        service.loginDoctor({
          phone: '+963912345678',
          password: 'pass',
        } as any),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException on wrong password', async () => {
      const doctorWithWrongPass = {
        ...mockDoctor,
        comparePassword: jest.fn().mockResolvedValue(false),
        incrementFailedAttempts: jest.fn(),
        save: jest.fn().mockResolvedValue(undefined),
      };
      doctorModel.findOne.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        session: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(doctorWithWrongPass),
      });

      await expect(
        service.loginDoctor({
          phone: '+963912345678',
          password: 'wrong',
        } as any),
      ).rejects.toThrow(UnauthorizedException);
      expect(doctorWithWrongPass.incrementFailedAttempts).toHaveBeenCalled();
    });

    it('throws UnauthorizedException when max sessions exceeded', async () => {
      const lockedDoctor = {
        ...mockDoctor,
        getActiveSessionsCount: jest.fn().mockReturnValue(5),
        save: jest.fn().mockResolvedValue(undefined),
      };
      doctorModel.findOne.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        session: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(lockedDoctor),
      });

      await expect(
        service.loginDoctor({
          phone: '+963912345678',
          password: 'pass',
        } as any),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('aborts transaction on error', async () => {
      doctorModel.findOne.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        session: jest.fn().mockReturnThis(),
        exec: jest.fn().mockRejectedValue(new Error('DB error')),
      });

      await expect(
        service.loginDoctor({
          phone: '+963912345678',
          password: 'pass',
        } as any),
      ).rejects.toThrow('DB error');
      expect(mockSession.abortTransaction).toHaveBeenCalled();
    });
  });

  // ─── isApprovedDoctorByPhone ───────────────────────────────────────────────

  describe('isApprovedDoctorByPhone()', () => {
    it('returns exists:true, approved:true when doctor found', async () => {
      doctorModel.findOne.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(mockDoctor),
      });

      const result = await service.isApprovedDoctorByPhone('+963912345678');

      expect(result.exists).toBe(true);
      expect(result.approved).toBe(true);
    });

    it('returns exists:false, approved:false when doctor not found', async () => {
      doctorModel.findOne.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(null),
      });

      const result = await service.isApprovedDoctorByPhone('+963999999');

      expect(result.exists).toBe(false);
      expect(result.approved).toBe(false);
    });
  });

  // ─── deleteDoctorRecord ────────────────────────────────────────────────────

  describe('deleteDoctorRecord()', () => {
    it('calls findByIdAndDelete with doctorId', async () => {
      doctorModel.findByIdAndDelete.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      await service.deleteDoctorRecord(doctorId);

      expect(doctorModel.findByIdAndDelete).toHaveBeenCalledWith(doctorId);
    });

    it('returns without calling delete when doctorId is invalid', async () => {
      await service.deleteDoctorRecord('invalid-id');

      expect(doctorModel.findByIdAndDelete).not.toHaveBeenCalled();
    });
  });

  // ─── updateDoctorFCMToken ─────────────────────────────────────────────────

  describe('updateDoctorFCMToken()', () => {
    it('updates FCM token successfully', async () => {
      const saveMock = jest.fn().mockResolvedValue(undefined);
      doctorModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          _id: new Types.ObjectId(doctorId),
          fcmToken: null,
          save: saveMock,
        }),
      });

      const result = await service.updateDoctorFCMToken(
        doctorId,
        'new-fcm-token-123',
      );

      expect(result.tokenUpdated).toBe(true);
      expect(result.message).toBe('FCM token updated successfully');
      expect(saveMock).toHaveBeenCalled();
    });

    it('throws BadRequestException for invalid doctor ID', async () => {
      await expect(
        service.updateDoctorFCMToken('invalid-id', 'token'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for empty FCM token', async () => {
      await expect(service.updateDoctorFCMToken(doctorId, '')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException for whitespace-only FCM token', async () => {
      await expect(
        service.updateDoctorFCMToken(doctorId, '   '),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when doctor not found', async () => {
      doctorModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(
        service.updateDoctorFCMToken(doctorId, 'token-123'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── getAllSlots ──────────────────────────────────────────────────────────

  describe('getAllSlots()', () => {
    it('throws BadRequestException when neither date nor dayName provided', async () => {
      await expect(service.getAllSlots(doctorId, {} as any)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException for invalid doctor ID', async () => {
      await expect(
        service.getAllSlots('invalid-id', { date: '2026-04-01' } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('returns cached slots when cache hit', async () => {
      const cachedData = [
        { slotId: 'slot1', date: '2026-04-01', status: 'available' },
      ];
      const cacheService = (service as any).cacheManager;
      cacheService.get.mockResolvedValue(cachedData);

      const result = await service.getAllSlots(doctorId, {
        date: '2026-04-01',
      } as any);

      expect(result).toEqual(cachedData);
    });

    it('throws NotFoundException when doctor not found', async () => {
      const cacheService = (service as any).cacheManager;
      cacheService.get.mockResolvedValue(null);

      doctorModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(
        service.getAllSlots(doctorId, { date: '2026-04-01' } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('returns slots filtered by date', async () => {
      const cacheService = (service as any).cacheManager;
      cacheService.get.mockResolvedValue(null);

      doctorModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockDoctor),
      });

      const mockSlots = [
        {
          _id: new Types.ObjectId(),
          date: new Date('2026-04-01'),
          startTime: '09:00',
          endTime: '09:30',
          status: 'available',
          location: { type: 'clinic' },
        },
      ];
      slotModel.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue(mockSlots),
          }),
        }),
      });

      const result = await service.getAllSlots(doctorId, {
        date: '2026-04-01',
      } as any);

      expect(result).toHaveLength(1);
      expect(result[0].startTime).toBe('09:00');
      expect(cacheService.set).toHaveBeenCalled();
    });
  });

  // ─── checkPauseConflicts ──────────────────────────────────────────────────

  describe('checkPauseConflicts()', () => {
    const slotId1 = new Types.ObjectId().toString();
    const _slotId2 = new Types.ObjectId().toString();

    it('throws BadRequestException for invalid doctor ID', async () => {
      await expect(
        service.checkPauseConflicts(
          { slotIds: [slotId1] } as any,
          'invalid-id',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when doctor not found', async () => {
      doctorModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(
        service.checkPauseConflicts({ slotIds: [slotId1] } as any, doctorId),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException for invalid slot ID', async () => {
      doctorModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockDoctor),
      });

      await expect(
        service.checkPauseConflicts(
          { slotIds: ['bad-slot-id'] } as any,
          doctorId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when no valid slots found', async () => {
      doctorModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockDoctor),
      });
      slotModel.find.mockReturnValue({
        exec: jest.fn().mockResolvedValue([]),
      });

      await expect(
        service.checkPauseConflicts({ slotIds: [slotId1] } as any, doctorId),
      ).rejects.toThrow(NotFoundException);
    });

    it('returns no conflicts when no bookings exist', async () => {
      doctorModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockDoctor),
      });
      slotModel.find.mockReturnValue({
        exec: jest
          .fn()
          .mockResolvedValue([{ _id: new Types.ObjectId(slotId1) }]),
      });
      bookingModel.find.mockReturnValue({
        populate: jest.fn().mockReturnValue({
          lean: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue([]),
          }),
        }),
      });

      const result = await service.checkPauseConflicts(
        { slotIds: [slotId1] } as any,
        doctorId,
      );

      expect(result.hasConflicts).toBe(false);
      expect(result.affectedBookings).toHaveLength(0);
      expect(result.warningMessage).toBeUndefined();
    });

    it('returns conflicts when bookings exist for slots', async () => {
      const patientId = new Types.ObjectId();
      doctorModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockDoctor),
      });
      slotModel.find.mockReturnValue({
        exec: jest
          .fn()
          .mockResolvedValue([{ _id: new Types.ObjectId(slotId1) }]),
      });
      bookingModel.find.mockReturnValue({
        populate: jest.fn().mockReturnValue({
          lean: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue([
              {
                _id: new Types.ObjectId(),
                patientId: {
                  _id: patientId,
                  username: 'John',
                  phone: '+963999',
                },
                bookingTime: '10:00',
                bookingEndTime: '10:30',
              },
            ]),
          }),
        }),
      });

      const result = await service.checkPauseConflicts(
        { slotIds: [slotId1] } as any,
        doctorId,
      );

      expect(result.hasConflicts).toBe(true);
      expect(result.affectedBookings).toHaveLength(1);
      expect(result.warningMessage).toContain('1 booking(s)');
    });
  });

  // ─── pauseSlots ───────────────────────────────────────────────────────────

  describe('pauseSlots()', () => {
    const slotId1 = new Types.ObjectId().toString();

    it('throws BadRequestException for invalid doctor ID', async () => {
      await expect(
        service.pauseSlots({ slotIds: [slotId1] } as any, 'invalid-id'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when doctor not found', async () => {
      doctorModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(
        service.pauseSlots({ slotIds: [slotId1] } as any, doctorId),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException when conflicts exist and confirmPause is false', async () => {
      const patientId = new Types.ObjectId();
      doctorModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockDoctor),
      });
      slotModel.find.mockReturnValue({
        exec: jest
          .fn()
          .mockResolvedValue([{ _id: new Types.ObjectId(slotId1) }]),
      });
      bookingModel.find.mockReturnValue({
        populate: jest.fn().mockReturnValue({
          lean: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue([
              {
                _id: new Types.ObjectId(),
                patientId: {
                  _id: patientId,
                  username: 'John',
                  phone: '+963999',
                },
                bookingTime: '10:00',
                bookingEndTime: '10:30',
              },
            ]),
          }),
        }),
      });

      await expect(
        service.pauseSlots(
          { slotIds: [slotId1], confirmPause: false } as any,
          doctorId,
        ),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ─── checkVIPBookingConflict ──────────────────────────────────────────────

  describe('checkVIPBookingConflict()', () => {
    const slotId = new Types.ObjectId().toString();

    it('throws BadRequestException for invalid doctor ID', async () => {
      await expect(
        service.checkVIPBookingConflict({ slotId } as any, 'invalid-id'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for invalid slot ID', async () => {
      await expect(
        service.checkVIPBookingConflict({ slotId: 'bad-id' } as any, doctorId),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when doctor not found', async () => {
      doctorModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(
        service.checkVIPBookingConflict({ slotId } as any, doctorId),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when slot not found', async () => {
      doctorModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockDoctor),
      });
      slotModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(
        service.checkVIPBookingConflict({ slotId } as any, doctorId),
      ).rejects.toThrow(NotFoundException);
    });

    it('returns no conflict when slot is available', async () => {
      doctorModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockDoctor),
      });
      slotModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          _id: new Types.ObjectId(slotId),
          status: 'available',
        }),
      });

      const result = await service.checkVIPBookingConflict(
        { slotId } as any,
        doctorId,
      );

      expect(result.hasConflict).toBe(false);
      expect(result.canProceed).toBe(true);
    });

    it('returns conflict with canProceed false when slot is blocked', async () => {
      doctorModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockDoctor),
      });
      slotModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          _id: new Types.ObjectId(slotId),
          status: 'blocked',
        }),
      });

      const result = await service.checkVIPBookingConflict(
        { slotId } as any,
        doctorId,
      );

      expect(result.hasConflict).toBe(true);
      expect(result.canProceed).toBe(false);
    });
  });

  // ─── checkHolidayConflict ─────────────────────────────────────────────────

  describe('checkHolidayConflict()', () => {
    it('throws BadRequestException for invalid doctor ID', async () => {
      await expect(
        service.checkHolidayConflict(
          { startDate: '2026-04-01', endDate: '2026-04-05' } as any,
          'invalid-id',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when doctor not found', async () => {
      doctorModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(
        service.checkHolidayConflict(
          { startDate: '2026-04-01', endDate: '2026-04-05' } as any,
          doctorId,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when start date is after end date', async () => {
      doctorModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockDoctor),
      });

      await expect(
        service.checkHolidayConflict(
          { startDate: '2026-04-10', endDate: '2026-04-01' } as any,
          doctorId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('returns no conflicts when no bookings in range', async () => {
      doctorModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockDoctor),
      });
      slotModel.find.mockReturnValue({
        lean: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([]),
        }),
      });
      bookingModel.find.mockReturnValue({
        populate: jest.fn().mockReturnValue({
          lean: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue([]),
          }),
        }),
      });

      const result = await service.checkHolidayConflict(
        { startDate: '2026-04-01', endDate: '2026-04-03' } as any,
        doctorId,
      );

      expect(result.hasConflicts).toBe(false);
      expect(result.affectedBookings).toHaveLength(0);
    });
  });

  // ─── createHoliday ────────────────────────────────────────────────────────

  describe('createHoliday()', () => {
    it('throws ConflictException when conflicts exist and not confirmed', async () => {
      doctorModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockDoctor),
      });
      slotModel.find.mockReturnValue({
        lean: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([]),
        }),
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue([]),
          }),
        }),
      });
      const patientId = new Types.ObjectId();
      bookingModel.find.mockReturnValue({
        populate: jest.fn().mockReturnValue({
          lean: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue([
              {
                _id: new Types.ObjectId(),
                patientId: {
                  _id: patientId,
                  username: 'Test',
                  phone: '+963999',
                },
                bookingDate: new Date(),
                bookingTime: '10:00',
                location: 'clinic',
              },
            ]),
          }),
        }),
      });

      await expect(
        service.createHoliday(
          {
            startDate: '2026-04-01',
            endDate: '2026-04-05',
            reason: 'vacation',
            confirmHoliday: false,
          } as any,
          doctorId,
        ),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ─── doctorCancelBooking ──────────────────────────────────────────────────

  describe('doctorCancelBooking()', () => {
    const bookingId = new Types.ObjectId().toString();

    it('throws NotFoundException when doctor not found', async () => {
      doctorModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(
        service.doctorCancelBooking(
          { bookingId, reason: 'test' } as any,
          doctorId,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException for invalid booking ID', async () => {
      doctorModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockDoctor),
      });

      await expect(
        service.doctorCancelBooking(
          { bookingId: 'bad-id', reason: 'test' } as any,
          doctorId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for invalid doctor ID', async () => {
      doctorModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockDoctor),
      });

      await expect(
        service.doctorCancelBooking(
          { bookingId, reason: 'test' } as any,
          'bad-id',
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── completeBooking ──────────────────────────────────────────────────────

  describe('completeBooking()', () => {
    const bookingId = new Types.ObjectId().toString();

    it('throws BadRequestException for invalid booking ID', async () => {
      await expect(
        service.completeBooking({ bookingId: 'bad-id' } as any, doctorId),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for invalid doctor ID', async () => {
      await expect(
        service.completeBooking({ bookingId } as any, 'bad-id'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when booking not found', async () => {
      bookingModel.findOne.mockReturnValue({
        populate: jest.fn().mockReturnValue({
          populate: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue(null),
          }),
        }),
      });

      await expect(
        service.completeBooking({ bookingId } as any, doctorId),
      ).rejects.toThrow(NotFoundException);
    });

    it('completes booking successfully', async () => {
      const patientOid = new Types.ObjectId();
      const doctorOid = new Types.ObjectId(doctorId);
      const mockBooking = {
        _id: new Types.ObjectId(bookingId),
        status: 'pending',
        completedAt: null as Date | null,
        note: null as string | null,
        bookingDate: new Date(),
        bookingTime: '10:00',
        patientId: {
          _id: patientOid,
          username: 'Patient1',
          phone: '+963111',
          fcmToken: 'fcm-token',
        },
        doctorId: {
          _id: doctorOid,
          firstName: 'Dr',
          lastName: 'Test',
        },
        save: jest.fn().mockResolvedValue(undefined),
      };
      bookingModel.findOne.mockReturnValue({
        populate: jest.fn().mockReturnValue({
          populate: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue(mockBooking),
          }),
        }),
      });

      const result = await service.completeBooking(
        { bookingId } as any,
        doctorId,
      );

      expect(result.message).toBe('تم إنجاز الحجز بنجاح');
      expect(result.bookingId).toBe(bookingId);
      expect(mockBooking.save).toHaveBeenCalled();
    });
  });

  // ─── getDoctorPatientGenderStats ──────────────────────────────────────────

  describe('getDoctorPatientGenderStats()', () => {
    it('throws BadRequestException for invalid doctor ID', async () => {
      await expect(
        service.getDoctorPatientGenderStats('invalid-id'),
      ).rejects.toThrow(BadRequestException);
    });

    it('returns cached stats when cache hit', async () => {
      const cachedStats = {
        doctorId,
        doctorName: 'Dr Test',
        totalPatients: 10,
      };
      const cacheService = (service as any).cacheManager;
      cacheService.get.mockResolvedValue(cachedStats);

      const result = await service.getDoctorPatientGenderStats(doctorId);

      expect(result).toEqual(cachedStats);
    });

    it('computes stats when cache miss and no patients', async () => {
      const cacheService = (service as any).cacheManager;
      cacheService.get.mockResolvedValue(null);

      doctorModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          ...mockDoctor,
          firstName: 'Dr',
          middleName: 'M',
          lastName: 'Test',
        }),
      });
      bookingModel.distinct.mockReturnValue({
        exec: jest.fn().mockResolvedValue([]),
      });

      const result = await service.getDoctorPatientGenderStats(doctorId);

      expect(result.totalPatients).toBe(0);
      expect(result.gender.male.count).toBe(0);
      expect(result.gender.female.count).toBe(0);
      expect(cacheService.set).toHaveBeenCalled();
    });
  });

  // ─── computeAndCacheStats ─────────────────────────────────────────────────

  describe('computeAndCacheStats()', () => {
    it('throws NotFoundException when doctor not found', async () => {
      doctorModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(service.computeAndCacheStats(doctorId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns stats with gender breakdown', async () => {
      const cacheService = (service as any).cacheManager;

      doctorModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          ...mockDoctor,
          firstName: 'Dr',
          middleName: 'M',
          lastName: 'Test',
        }),
      });

      const patientIds = [
        new Types.ObjectId(),
        new Types.ObjectId(),
        new Types.ObjectId(),
      ];
      bookingModel.distinct.mockReturnValue({
        exec: jest.fn().mockResolvedValue(patientIds),
      });
      userModel.aggregate.mockReturnValue({
        exec: jest.fn().mockResolvedValue([
          { _id: 'male', count: 2 },
          { _id: 'female', count: 1 },
        ]),
      });

      const result = await service.computeAndCacheStats(doctorId);

      expect(result.totalPatients).toBe(3);
      expect(result.gender.male.count).toBe(2);
      expect(result.gender.female.count).toBe(1);
      expect(result.gender.unknown.count).toBe(0);
      expect(result.doctorName).toBe('Dr M Test');
      expect(cacheService.set).toHaveBeenCalled();
    });
  });

  // ─── requestPasswordResetOtp ──────────────────────────────────────────────

  describe('requestPasswordResetOtp()', () => {
    it('throws NotFoundException when doctor not found', async () => {
      connection.startSession.mockResolvedValue(mockSession);

      doctorModel.findOne.mockReturnValue({
        session: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(null),
        }),
      });

      await expect(
        service.requestPasswordResetOtp({ phone: '+963999' } as any),
      ).rejects.toThrow(NotFoundException);
      expect(mockSession.abortTransaction).toHaveBeenCalled();
    });

    it('throws BadRequestException when doctor is not approved', async () => {
      connection.startSession.mockResolvedValue(mockSession);

      doctorModel.findOne.mockReturnValue({
        session: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue({
            ...mockDoctor,
            status: ApprovalStatus.PENDING,
            authAccountId: new Types.ObjectId(),
          }),
        }),
      });

      await expect(
        service.requestPasswordResetOtp({ phone: '+963912345678' } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('generates OTP and sends it when doctor is approved', async () => {
      connection.startSession.mockResolvedValue(mockSession);
      const authAccountId = new Types.ObjectId();

      doctorModel.findOne.mockReturnValue({
        session: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue({
            ...mockDoctor,
            status: ApprovalStatus.APPROVED,
            authAccountId,
          }),
        }),
      });
      otpModel.deleteMany.mockReturnValue({
        session: jest.fn().mockResolvedValue(undefined),
      });
      otpModel.create.mockResolvedValue([{ code: '123456' }]);

      const result = await service.requestPasswordResetOtp({
        phone: '+963912345678',
      } as any);

      expect(result.success).toBe(true);
      expect(mockSession.commitTransaction).toHaveBeenCalled();
    });
  });

  // ─── verifyPasswordResetOtp ───────────────────────────────────────────────

  describe('verifyPasswordResetOtp()', () => {
    it('throws NotFoundException when doctor not found', async () => {
      connection.startSession.mockResolvedValue(mockSession);

      doctorModel.findOne.mockReturnValue({
        session: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(null),
        }),
      });

      await expect(
        service.verifyPasswordResetOtp({
          phone: '+963999',
          otp: '123456',
        } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when auth account not found', async () => {
      connection.startSession.mockResolvedValue(mockSession);

      doctorModel.findOne.mockReturnValue({
        session: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(mockDoctor),
        }),
      });
      authModel.findOne.mockReturnValue(null);

      await expect(
        service.verifyPasswordResetOtp({
          phone: '+963912345678',
          otp: '123456',
        } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws UnauthorizedException when OTP is expired', async () => {
      connection.startSession.mockResolvedValue(mockSession);

      doctorModel.findOne.mockReturnValue({
        session: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(mockDoctor),
        }),
      });
      const authId = new Types.ObjectId();
      authModel.findOne.mockReturnValue({ _id: authId });
      otpModel.findOne.mockReturnValue({
        _id: new Types.ObjectId(),
        code: '123456',
        isExpired: jest.fn().mockReturnValue(true),
        isMaxAttemptsReached: jest.fn().mockReturnValue(false),
      });

      await expect(
        service.verifyPasswordResetOtp({
          phone: '+963912345678',
          otp: '123456',
        } as any),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('returns success when OTP is correct', async () => {
      connection.startSession.mockResolvedValue(mockSession);

      doctorModel.findOne.mockReturnValue({
        session: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(mockDoctor),
        }),
      });
      const authId = new Types.ObjectId();
      authModel.findOne.mockReturnValue({ _id: authId });
      otpModel.findOne.mockReturnValue({
        _id: new Types.ObjectId(),
        code: '123456',
        isExpired: jest.fn().mockReturnValue(false),
        isMaxAttemptsReached: jest.fn().mockReturnValue(false),
      });

      const result = await service.verifyPasswordResetOtp({
        phone: '+963912345678',
        otp: '123456',
      } as any);

      expect(result.success).toBe(true);
      expect(mockSession.commitTransaction).toHaveBeenCalled();
    });
  });

  // ─── resetPassword ────────────────────────────────────────────────────────

  describe('resetPassword()', () => {
    it('throws NotFoundException when doctor not found', async () => {
      connection.startSession.mockResolvedValue(mockSession);

      doctorModel.findOne.mockReturnValue({
        select: jest.fn().mockReturnValue({
          session: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue(null),
          }),
        }),
      });

      await expect(
        service.resetPassword({
          phone: '+963999',
          otp: '123456',
          newPassword: 'newPass123',
        } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws UnauthorizedException when OTP code does not match', async () => {
      connection.startSession.mockResolvedValue(mockSession);

      doctorModel.findOne.mockReturnValue({
        select: jest.fn().mockReturnValue({
          session: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue({
              ...mockDoctor,
              password: 'hashed',
            }),
          }),
        }),
      });
      const authId = new Types.ObjectId();
      authModel.findOne.mockReturnValue({ _id: authId });
      otpModel.findOne.mockReturnValue({
        _id: new Types.ObjectId(),
        code: '654321',
        isExpired: jest.fn().mockReturnValue(false),
        isMaxAttemptsReached: jest.fn().mockReturnValue(false),
        incrementAttempts: jest.fn(),
        attempts: 1,
        maxAttempts: 5,
        save: jest.fn().mockResolvedValue(undefined),
      });

      await expect(
        service.resetPassword({
          phone: '+963912345678',
          otp: '123456',
          newPassword: 'newPass123',
        } as any),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  // ─── updateDoctorFiles ────────────────────────────────────────────────────

  describe('updateDoctorFiles()', () => {
    it('updates doctor with certificate image file info', async () => {
      doctorModel.findByIdAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue(undefined),
      });

      await service.updateDoctorFiles(doctorId, {
        certificateImage: {
          url: 'https://storage.example.com/cert.jpg',
          fileName: 'cert.jpg',
          bucket: 'docs',
        } as any,
      });

      expect(doctorModel.findByIdAndUpdate).toHaveBeenCalledWith(
        doctorId,
        expect.objectContaining({
          documents: expect.objectContaining({
            certificateImage: 'https://storage.example.com/cert.jpg',
            certificateImageFileName: 'cert.jpg',
            certificateImageBucket: 'docs',
          }),
        }),
      );
    });

    it('updates doctor with multiple file types', async () => {
      doctorModel.findByIdAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue(undefined),
      });

      await service.updateDoctorFiles(doctorId, {
        certificateImage: {
          url: 'cert-url',
          fileName: 'cert.jpg',
          bucket: 'b1',
        } as any,
        licenseImage: {
          url: 'lic-url',
          fileName: 'lic.jpg',
          bucket: 'b2',
        } as any,
      });

      expect(doctorModel.findByIdAndUpdate).toHaveBeenCalledWith(
        doctorId,
        expect.objectContaining({
          documents: expect.objectContaining({
            certificateImage: 'cert-url',
            licenseImage: 'lic-url',
          }),
        }),
      );
    });
  });
});
