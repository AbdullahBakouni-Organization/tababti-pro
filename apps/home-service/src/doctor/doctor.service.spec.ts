import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
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
});
