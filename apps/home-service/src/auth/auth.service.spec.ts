import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { getModelToken, getConnectionToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { AuthService } from './auth.service';
import { AuthAccount } from '@app/common/database/schemas/auth.schema';
import { Otp } from '@app/common/database/schemas/otp.schema';
import { User } from '@app/common/database/schemas/user.schema';
import { KafkaService } from '@app/common/kafka/kafka.service';
import { AuthValidateService } from '@app/common/auth-validate';
import { MinioService } from '@app/common/file-storage';
import { SmsService } from '../sms/sms.service';
import {
  createMockKafkaService,
  createMockAuthValidateService,
  createMockMinioService,
} from '@app/common/testing';
import { createMockModel, createMockConnection } from '@app/common/testing';

// ─── SmsService mock ─────────────────────────────────────────────────────────

const mockSmsService = {
  generateOTP: jest.fn().mockReturnValue('123456'),
  sendOTP: jest.fn().mockResolvedValue(undefined),
};

describe('AuthService', () => {
  let service: AuthService;
  let authModel: ReturnType<typeof createMockModel>;
  let otpModel: ReturnType<typeof createMockModel>;
  let userModel: ReturnType<typeof createMockModel>;
  let connection: ReturnType<typeof createMockConnection>;
  let kafkaService: ReturnType<typeof createMockKafkaService>;
  let authValidateService: ReturnType<typeof createMockAuthValidateService>;
  let minioService: ReturnType<typeof createMockMinioService>;

  // Shared IDs
  const accountId = new Types.ObjectId();
  const userId = new Types.ObjectId();

  // Mock auth account document
  const mockAuthAccount = {
    _id: accountId,
    phones: ['+963912345678'],
    role: 'user',
    isActive: false,
    tokenVersion: 1,
    lastLoginAt: null,
    authAccountId: accountId,
    save: jest.fn().mockResolvedValue(undefined),
  };

  // Mock OTP document with methods
  const mockOtp = {
    _id: new Types.ObjectId(),
    authAccountId: accountId,
    phone: '+963912345678',
    code: '123456',
    expiresAt: new Date(Date.now() + 600000),
    isUsed: false,
    attempts: 0,
    isExpired: jest.fn().mockReturnValue(false),
    isMaxAttemptsReached: jest.fn().mockReturnValue(false),
    incrementAttempts: jest.fn(),
    save: jest.fn().mockResolvedValue(undefined),
  };

  // Mock user document
  const mockUser = {
    _id: userId,
    authAccountId: accountId,
    phone: '+963912345678',
    username: 'TestUser',
    fcmToken: 'fcm-token',
    profileImage: null,
    profileImageFileName: null,
    profileImageBucket: null,
    save: jest.fn().mockResolvedValue(undefined),
    toObject: jest.fn().mockReturnValue({
      _id: userId,
      authAccountId: accountId,
      username: 'TestUser',
    }),
  };

  beforeEach(async () => {
    authModel = createMockModel();
    otpModel = createMockModel();
    userModel = createMockModel();
    connection = createMockConnection();
    kafkaService = createMockKafkaService();
    authValidateService = createMockAuthValidateService();
    minioService = createMockMinioService();

    // Reset per-test mocks
    mockAuthAccount.save.mockResolvedValue(undefined);
    mockOtp.isExpired.mockReturnValue(false);
    mockOtp.isMaxAttemptsReached.mockReturnValue(false);
    mockOtp.save.mockResolvedValue(undefined);
    mockUser.save.mockResolvedValue(undefined);
    mockSmsService.generateOTP.mockReturnValue('123456');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getModelToken(AuthAccount.name), useValue: authModel },
        { provide: getModelToken(Otp.name), useValue: otpModel },
        { provide: getModelToken(User.name), useValue: userModel },
        { provide: getConnectionToken(), useValue: connection },
        { provide: SmsService, useValue: mockSmsService },
        { provide: KafkaService, useValue: kafkaService },
        { provide: AuthValidateService, useValue: authValidateService },
        { provide: MinioService, useValue: minioService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─── requestOtp ───────────────────────────────────────────────────────────

  describe('requestOtp()', () => {
    const dto = { phone: '+963912345678', lang: 'ar' };

    it('creates new auth account and OTP when phone not registered', async () => {
      authModel.findOne.mockReturnValue({
        session: jest.fn().mockResolvedValue(null),
      });
      authModel.create.mockResolvedValue([mockAuthAccount]);
      otpModel.deleteMany.mockReturnValue({
        session: jest.fn().mockResolvedValue(undefined),
      });
      otpModel.create.mockResolvedValue([mockOtp]);

      const result = await service.requestOtp(dto as any);

      expect(result).toEqual({ success: true, message: 'OTP sent' });
      expect(authModel.create).toHaveBeenCalled();
      expect(otpModel.create).toHaveBeenCalled();
    });

    it('reuses existing auth account when phone is already registered', async () => {
      authModel.findOne.mockReturnValue({
        session: jest.fn().mockResolvedValue(mockAuthAccount),
      });
      otpModel.deleteMany.mockReturnValue({
        session: jest.fn().mockResolvedValue(undefined),
      });
      otpModel.create.mockResolvedValue([mockOtp]);

      const result = await service.requestOtp(dto as any);

      expect(result.success).toBe(true);
      expect(authModel.create).not.toHaveBeenCalled();
    });

    it('emits Kafka WhatsApp OTP event', async () => {
      authModel.findOne.mockReturnValue({
        session: jest.fn().mockResolvedValue(mockAuthAccount),
      });
      otpModel.deleteMany.mockReturnValue({
        session: jest.fn().mockResolvedValue(undefined),
      });
      otpModel.create.mockResolvedValue([mockOtp]);

      await service.requestOtp(dto as any);

      expect(kafkaService.emit).toHaveBeenCalledWith(
        expect.stringContaining('whatsapp'),
        expect.objectContaining({ phone: dto.phone, otp: '123456' }),
      );
    });

    it('aborts transaction on error', async () => {
      authModel.findOne.mockReturnValue({
        session: jest.fn().mockRejectedValue(new Error('DB error')),
      });

      await expect(service.requestOtp(dto as any)).rejects.toThrow('DB error');

      expect(
        (connection as any)._mockSession.abortTransaction,
      ).toHaveBeenCalled();
    });
  });

  // ─── verifyOtp ────────────────────────────────────────────────────────────

  describe('verifyOtp()', () => {
    const dto = { phone: '+963912345678', code: '123456' };
    const mockRes = {} as any;

    beforeEach(() => {
      // Reset mutable OTP state before each test
      mockOtp.isUsed = false;
      mockOtp.isExpired.mockReturnValue(false);
      mockOtp.isMaxAttemptsReached.mockReturnValue(false);
      mockOtp.incrementAttempts.mockReset();
      mockOtp.save.mockResolvedValue(undefined);

      authModel.findOne.mockReturnValue({
        session: jest.fn().mockResolvedValue(mockAuthAccount),
      });

      const otpQuery = {
        sort: jest.fn().mockReturnThis(),
        session: jest.fn().mockResolvedValue(mockOtp),
      };
      otpModel.findOne.mockReturnValue(otpQuery);

      userModel.findOne.mockReturnValue({
        session: jest.fn().mockResolvedValue(mockUser),
      });
    });

    it('returns tokens and needsCompletion: false for existing user', async () => {
      const result = await service.verifyOtp(dto as any, mockRes);

      expect(result.success).toBe(true);
      expect(result.needsCompletion).toBe(false);
      expect(result.access_token).toBe('mock-access-token');
      expect(result.refresh_token).toBe('mock-refresh-token');
    });

    it('returns needsCompletion: true when user profile does not exist', async () => {
      userModel.findOne.mockReturnValue({
        session: jest.fn().mockResolvedValue(null),
      });

      const result = await service.verifyOtp(dto as any, mockRes);

      expect(result.success).toBe(true);
      expect(result.needsCompletion).toBe(true);
    });

    it('throws NotFoundException when auth account not found', async () => {
      authModel.findOne.mockReturnValue({
        session: jest.fn().mockResolvedValue(null),
      });

      await expect(service.verifyOtp(dto as any, mockRes)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws BadRequestException when OTP not found', async () => {
      const otpQuery = {
        sort: jest.fn().mockReturnThis(),
        session: jest.fn().mockResolvedValue(null),
      };
      otpModel.findOne.mockReturnValue(otpQuery);

      await expect(service.verifyOtp(dto as any, mockRes)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws UnauthorizedException when OTP is expired', async () => {
      mockOtp.isExpired.mockReturnValue(true);

      await expect(service.verifyOtp(dto as any, mockRes)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws UnauthorizedException when max attempts reached', async () => {
      mockOtp.isMaxAttemptsReached.mockReturnValue(true);

      await expect(service.verifyOtp(dto as any, mockRes)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws UnauthorizedException and increments attempts on wrong code', async () => {
      const wrongDto = { phone: '+963912345678', code: '000000' };

      await expect(service.verifyOtp(wrongDto as any, mockRes)).rejects.toThrow(
        UnauthorizedException,
      );

      expect(mockOtp.incrementAttempts).toHaveBeenCalled();
      expect(mockOtp.save).toHaveBeenCalled();
    });
  });

  // ─── completeRegistration ─────────────────────────────────────────────────

  describe('completeRegistration()', () => {
    const dto = {
      phone: '+963912345678',
      username: 'Ali Hassan',
      gender: 'male',
      city: 'Damascus',
      DataofBirth: new Date('1990-01-01'),
    };

    it('creates user and returns success response', async () => {
      authModel.findOne.mockReturnValue({
        session: jest.fn().mockResolvedValue(mockAuthAccount),
      });
      userModel.findOne.mockReturnValue({
        session: jest.fn().mockResolvedValue(null), // no existing user
      });
      userModel.create.mockResolvedValue([mockUser]);

      const result = await service.completeRegistration(dto as any);

      expect(result.success).toBe(true);
      expect(userModel.create).toHaveBeenCalled();
    });

    it('uploads profile image to MinIO when provided', async () => {
      authModel.findOne.mockReturnValue({
        session: jest.fn().mockResolvedValue(mockAuthAccount),
      });
      userModel.findOne.mockReturnValue({
        session: jest.fn().mockResolvedValue(null),
      });
      userModel.create.mockResolvedValue([mockUser]);

      const mockFile = {
        originalname: 'avatar.jpg',
        buffer: Buffer.from('image'),
        mimetype: 'image/jpeg',
        size: 1024,
      } as Express.Multer.File;

      await service.completeRegistration(dto as any, mockFile);

      expect(minioService.uploadFile).toHaveBeenCalledWith(
        mockFile,
        'patients',
        expect.stringContaining('patients/'),
      );
    });

    it('continues without image when MinIO upload fails', async () => {
      authModel.findOne.mockReturnValue({
        session: jest.fn().mockResolvedValue(mockAuthAccount),
      });
      userModel.findOne.mockReturnValue({
        session: jest.fn().mockResolvedValue(null),
      });
      userModel.create.mockResolvedValue([mockUser]);
      minioService.uploadFile.mockRejectedValue(new Error('MinIO down'));

      const mockFile = {
        originalname: 'avatar.jpg',
        buffer: Buffer.from('image'),
        mimetype: 'image/jpeg',
        size: 1024,
      } as Express.Multer.File;

      // Should NOT throw even when MinIO fails
      const result = await service.completeRegistration(dto as any, mockFile);
      expect(result.success).toBe(true);
    });

    it('throws NotFoundException when auth account not found', async () => {
      authModel.findOne.mockReturnValue({
        session: jest.fn().mockResolvedValue(null),
      });

      await expect(service.completeRegistration(dto as any)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws BadRequestException when user profile already exists', async () => {
      authModel.findOne.mockReturnValue({
        session: jest.fn().mockResolvedValue(mockAuthAccount),
      });
      userModel.findOne.mockReturnValue({
        session: jest.fn().mockResolvedValue(mockUser), // already exists
      });

      await expect(service.completeRegistration(dto as any)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ─── resendOtp ────────────────────────────────────────────────────────────

  describe('resendOtp()', () => {
    const dto = { phone: '+963912345678' };

    it('deletes previous OTPs, creates new one, and sends SMS', async () => {
      authModel.findOne.mockReturnValue({
        session: jest.fn().mockResolvedValue(mockAuthAccount),
      });
      otpModel.deleteMany.mockReturnValue({
        session: jest.fn().mockResolvedValue(undefined),
      });
      otpModel.create.mockResolvedValue([mockOtp]);

      const result = await service.resendOtp(dto as any);

      expect(result.success).toBe(true);
      expect(otpModel.deleteMany).toHaveBeenCalled();
      expect(otpModel.create).toHaveBeenCalled();
      expect(mockSmsService.sendOTP).toHaveBeenCalledWith(dto.phone, '123456');
    });

    it('throws NotFoundException when phone not registered', async () => {
      authModel.findOne.mockReturnValue({
        session: jest.fn().mockResolvedValue(null),
      });

      await expect(service.resendOtp(dto as any)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── logout ───────────────────────────────────────────────────────────────

  describe('logout()', () => {
    it('increments tokenVersion and clears FCM token', async () => {
      userModel.findById.mockResolvedValue(mockUser);
      authModel.findByIdAndUpdate.mockResolvedValue(undefined);

      const result = await service.logout(userId.toString());

      expect(result.success).toBe(true);
      expect(authModel.findByIdAndUpdate).toHaveBeenCalledWith(
        mockUser.authAccountId,
        { $inc: { tokenVersion: 1 } },
        { new: true },
      );
      expect(mockUser.save).toHaveBeenCalled();
    });

    it('throws NotFoundException when user not found', async () => {
      userModel.findById.mockResolvedValue(null);

      await expect(service.logout(userId.toString())).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
