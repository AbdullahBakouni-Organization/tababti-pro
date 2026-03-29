import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { getModelToken, getConnectionToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { UsersService } from './users.service';
import { Booking } from '@app/common/database/schemas/booking.schema';
import { AppointmentSlot } from '@app/common/database/schemas/slot.schema';
import { User } from '@app/common/database/schemas/user.schema';
import {
  BookingStatus,
  SlotStatus,
} from '@app/common/database/schemas/common.enums';
import { KafkaService } from '@app/common/kafka/kafka.service';
import { CacheService } from '@app/common/cache/cache.service';
import { MinioService } from '@app/common/file-storage';
import { createMockModel, createMockConnection } from '@app/common/testing';

jest.mock('@app/common/utils/cache-invalidation.util', () => ({
  invalidateBookingCaches: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@app/common/utils/upload-profile-images.util', () => ({
  uploadUserProfileImage: jest.fn().mockResolvedValue(null),
}));

describe('UsersService', () => {
  let service: UsersService;
  let bookingModel: ReturnType<typeof createMockModel>;
  let slotModel: ReturnType<typeof createMockModel>;
  let userModel: ReturnType<typeof createMockModel>;
  let connection: ReturnType<typeof createMockConnection>;
  let kafkaService: { emit: jest.Mock; send: jest.Mock };
  let cacheManager: {
    get: jest.Mock;
    set: jest.Mock;
    invalidate: jest.Mock;
    invalidatePattern: jest.Mock;
  };
  let minioService: {
    uploadFile: jest.Mock;
    deleteFile: jest.Mock;
    getFileUrl: jest.Mock;
  };

  const patientId = new Types.ObjectId().toString();
  const doctorId = new Types.ObjectId().toString();
  const bookingId = new Types.ObjectId().toString();
  const slotId = new Types.ObjectId().toString();
  const userId = new Types.ObjectId().toString();

  const mockSession = {
    startTransaction: jest.fn(),
    commitTransaction: jest.fn().mockResolvedValue(undefined),
    abortTransaction: jest.fn().mockResolvedValue(undefined),
    endSession: jest.fn().mockResolvedValue(undefined),
    inTransaction: jest.fn().mockReturnValue(true),
  };

  const mockBooking = {
    _id: new Types.ObjectId(bookingId),
    patientId: {
      _id: new Types.ObjectId(patientId),
      username: 'TestUser',
      phone: '+963912345678',
    },
    doctorId: {
      _id: new Types.ObjectId(doctorId),
      firstName: 'Dr',
      lastName: 'Test',
      fcmToken: 'fcm-token',
    },
    slotId: new Types.ObjectId(slotId),
    status: BookingStatus.PENDING,
    bookingDate: new Date(),
    bookingTime: '10:00',
    cancellation: null,
    save: jest.fn().mockResolvedValue(undefined),
  };

  const mockUser = {
    _id: new Types.ObjectId(userId),
    username: 'TestUser',
    phone: '+963912345678',
    city: 'Damascus',
    gender: 'male',
    DataofBirth: new Date('1990-01-01'),
    profileImage: null,
    profileImageFileName: null,
    profileImageBucket: null,
    fcmToken: null,
    save: jest.fn().mockResolvedValue(undefined),
  };

  const mockSlot = {
    _id: new Types.ObjectId(slotId),
    date: new Date(Date.now() + 86400000), // tomorrow
    status: SlotStatus.AVAILABLE,
  };

  beforeEach(async () => {
    bookingModel = createMockModel();
    slotModel = createMockModel();
    userModel = createMockModel();
    connection = createMockConnection();
    kafkaService = { emit: jest.fn(), send: jest.fn() };
    cacheManager = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      invalidate: jest.fn(),
      invalidatePattern: jest.fn(),
    };
    minioService = {
      uploadFile: jest.fn().mockResolvedValue({
        url: 'http://minio/img.jpg',
        fileName: 'img.jpg',
        bucket: 'patients',
      }),
      deleteFile: jest.fn().mockResolvedValue(undefined),
      getFileUrl: jest.fn(),
    };

    mockBooking.save.mockResolvedValue(undefined);
    mockUser.save.mockResolvedValue(undefined);
    (bookingModel as any).db = {
      startSession: jest.fn().mockResolvedValue(mockSession),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getModelToken(Booking.name), useValue: bookingModel },
        { provide: getModelToken(AppointmentSlot.name), useValue: slotModel },
        { provide: getModelToken(User.name), useValue: userModel },
        { provide: getConnectionToken(), useValue: connection },
        { provide: KafkaService, useValue: kafkaService },
        { provide: CacheService, useValue: cacheManager },
        { provide: MinioService, useValue: minioService },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─── validateBooking ───────────────────────────────────────────────────────

  describe('validateBooking()', () => {
    beforeEach(() => {
      slotModel.findById.mockResolvedValue(mockSlot);
      bookingModel.countDocuments.mockResolvedValue(0);
    });

    it('returns canBook: true when all rules pass', async () => {
      const result = await service.validateBooking(
        patientId,
        doctorId,
        new Date(),
        slotId,
      );
      expect(result.canBook).toBe(true);
    });

    it('throws BadRequestException for invalid patientId', async () => {
      await expect(
        service.validateBooking('bad-id', doctorId, new Date(), slotId),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for invalid doctorId', async () => {
      await expect(
        service.validateBooking(patientId, 'bad-id', new Date(), slotId),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for invalid slotId', async () => {
      await expect(
        service.validateBooking(patientId, doctorId, new Date(), 'bad-id'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when slot not found', async () => {
      slotModel.findById.mockResolvedValue(null);
      await expect(
        service.validateBooking(patientId, doctorId, new Date(), slotId),
      ).rejects.toThrow(NotFoundException);
    });

    it('returns canBook: false when slot date is in the past', async () => {
      slotModel.findById.mockResolvedValue({
        ...mockSlot,
        date: new Date('2000-01-01'),
      });
      const result = await service.validateBooking(
        patientId,
        doctorId,
        new Date(),
        slotId,
      );
      expect(result.canBook).toBe(false);
    });

    it('returns canBook: false when slot is not AVAILABLE', async () => {
      slotModel.findById.mockResolvedValue({
        ...mockSlot,
        status: SlotStatus.BOOKED,
      });
      const result = await service.validateBooking(
        patientId,
        doctorId,
        new Date(),
        slotId,
      );
      expect(result.canBook).toBe(false);
    });

    it('returns canBook: false when patient already has booking with doctor', async () => {
      bookingModel.countDocuments.mockResolvedValueOnce(1); // existing booking with doctor
      const result = await service.validateBooking(
        patientId,
        doctorId,
        new Date(),
        slotId,
      );
      expect(result.canBook).toBe(false);
    });

    it('returns canBook: false when patient reached daily limit', async () => {
      bookingModel.countDocuments
        .mockResolvedValueOnce(0) // existing with doctor
        .mockResolvedValueOnce(3); // bookings today
      const result = await service.validateBooking(
        patientId,
        doctorId,
        new Date(),
        slotId,
      );
      expect(result.canBook).toBe(false);
    });
  });

  // ─── patientCancelBooking ──────────────────────────────────────────────────

  describe('patientCancelBooking()', () => {
    beforeEach(() => {
      bookingModel.countDocuments.mockResolvedValue(0); // no cancellations today
      bookingModel.findOne.mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        session: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(mockBooking),
      });
      slotModel.findByIdAndUpdate.mockReturnValue({
        session: jest.fn().mockResolvedValue(undefined),
      });
    });

    it('cancels booking and returns success response', async () => {
      const result = await service.patientCancelBooking(
        { bookingId },
        patientId,
      );
      expect(result.cancelled).toBe(true);
      expect(result.bookingId).toBe(bookingId);
      expect(mockSession.commitTransaction).toHaveBeenCalled();
    });

    it('throws BadRequestException for invalid bookingId', async () => {
      await expect(
        service.patientCancelBooking({ bookingId: 'bad' }, patientId),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for invalid patientId', async () => {
      await expect(
        service.patientCancelBooking({ bookingId }, 'bad'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws ForbiddenException when daily cancellation limit exceeded', async () => {
      bookingModel.countDocuments.mockResolvedValue(5); // already at limit
      await expect(
        service.patientCancelBooking({ bookingId }, patientId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when booking not found', async () => {
      bookingModel.findOne.mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        session: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(null),
      });
      await expect(
        service.patientCancelBooking({ bookingId }, patientId),
      ).rejects.toThrow(NotFoundException);
    });

    it('aborts transaction on error', async () => {
      bookingModel.findOne.mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        session: jest.fn().mockReturnThis(),
        exec: jest.fn().mockRejectedValue(new Error('DB error')),
      });
      await expect(
        service.patientCancelBooking({ bookingId }, patientId),
      ).rejects.toThrow('DB error');
      expect(mockSession.abortTransaction).toHaveBeenCalled();
    });

    it('emits Kafka event after successful cancellation', async () => {
      await service.patientCancelBooking({ bookingId }, patientId);
      expect(kafkaService.emit).toHaveBeenCalled();
    });
  });

  // ─── getActiveBookingsCount ────────────────────────────────────────────────

  describe('getActiveBookingsCount()', () => {
    it('returns totalActive, todayCount, and byDoctor breakdown', async () => {
      bookingModel.countDocuments
        .mockResolvedValueOnce(3) // totalActive
        .mockResolvedValueOnce(1); // todayCount
      bookingModel.aggregate.mockResolvedValue([
        { doctorId: doctorId, count: 2 },
      ]);

      const result = await service.getActiveBookingsCount(patientId);

      expect(result.totalActive).toBe(3);
      expect(result.todayCount).toBe(1);
      expect(result.byDoctor).toHaveLength(1);
    });

    it('throws BadRequestException for invalid patientId', async () => {
      await expect(service.getActiveBookingsCount('bad-id')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ─── getCancellationsToday ─────────────────────────────────────────────────

  describe('getCancellationsToday()', () => {
    it('returns count, remaining, and limit', async () => {
      bookingModel.countDocuments.mockResolvedValue(2);

      const result = await service.getCancellationsToday(patientId);

      expect(result.count).toBe(2);
      expect(result.remaining).toBe(3); // 5 - 2
      expect(result.limit).toBe(5);
    });

    it('throws BadRequestException for invalid patientId', async () => {
      await expect(service.getCancellationsToday('bad-id')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ─── updateFCMToken ────────────────────────────────────────────────────────

  describe('updateFCMToken()', () => {
    it('updates user FCM token and returns confirmation', async () => {
      const userWithSave = {
        ...mockUser,
        save: jest.fn().mockResolvedValue(undefined),
      };
      userModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(userWithSave),
      });

      const result = await service.updateFCMToken(userId, 'new-fcm-token');

      expect(result.tokenUpdated).toBe(true);
      expect(result.userId).toBe(userId);
      expect(userWithSave.save).toHaveBeenCalled();
    });

    it('throws BadRequestException for invalid userId', async () => {
      await expect(service.updateFCMToken('bad-id', 'token')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException when FCM token is empty', async () => {
      await expect(service.updateFCMToken(userId, '')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws NotFoundException when user not found', async () => {
      userModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });
      await expect(service.updateFCMToken(userId, 'token')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── getUserBookings ───────────────────────────────────────────────────────

  describe('getUserBookings()', () => {
    it('returns paginated bookings from aggregate', async () => {
      const mockAggResult = [
        {
          totalCount: [{ count: 1 }],
          data: [
            {
              _id: new Types.ObjectId(bookingId),
              status: BookingStatus.PENDING,
              bookingDate: new Date(),
              slot: {
                startTime: '10:00',
                endTime: '11:00',
                location: {},
                price: 5000,
              },
              doctor: { firstName: 'Dr', lastName: 'Test', image: null },
            },
          ],
        },
      ];
      bookingModel.aggregate.mockResolvedValue(mockAggResult);

      const result = await service.getUserBookings(userId, {
        page: 1,
        limit: 10,
      } as any);

      expect(result.bookings.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });

    it('returns cached result on cache hit', async () => {
      const cached = {
        bookings: { data: [], total: 0 },
        meta: {
          total: 0,
          page: 1,
          limit: 10,
          totalPages: 0,
          hasNextPage: false,
          hasPreviousPage: false,
        },
      };
      cacheManager.get.mockResolvedValue(cached);

      const result = await service.getUserBookings(userId, {
        page: 1,
        limit: 10,
      } as any);

      expect(result).toBe(cached);
      expect(bookingModel.aggregate).not.toHaveBeenCalled();
    });

    it('throws BadRequestException for invalid userId', async () => {
      await expect(
        service.getUserBookings('bad-id', { page: 1, limit: 10 } as any),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── updateUser ────────────────────────────────────────────────────────────

  describe('updateUser()', () => {
    it('updates user profile and returns updated user', async () => {
      const userWithSave = {
        ...mockUser,
        authAccountId: new Types.ObjectId(),
        DataofBirth: new Date('1990-01-01'),
        save: jest.fn().mockResolvedValue(undefined),
      };
      userModel.findById.mockReturnValue({
        session: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(userWithSave),
      });
      userModel.findOne.mockReturnValue({
        session: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(null),
      });

      const result = await service.updateUser(
        userId,
        { username: 'NewName' } as any,
        undefined,
      );

      expect(result.message).toBe('User updated successfully');
      expect(result.user.username).toBe('NewName');
    });

    it('throws NotFoundException for invalid userId', async () => {
      await expect(
        service.updateUser('bad-id', {} as any, undefined),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when user not found', async () => {
      userModel.findById.mockReturnValue({
        session: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(null),
      });
      await expect(
        service.updateUser(userId, {} as any, undefined),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException when username already taken', async () => {
      userModel.findById.mockReturnValue({
        session: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue({
          ...mockUser,
          save: jest.fn(),
          DataofBirth: new Date(),
        }),
      });
      userModel.findOne.mockReturnValue({
        session: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue({ username: 'TakenName' }),
      });

      await expect(
        service.updateUser(userId, { username: 'TakenName' } as any, undefined),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ─── getUserProfile ────────────────────────────────────────────────────────

  describe('getUserProfile()', () => {
    it('returns formatted user profile', async () => {
      userModel.findById.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(mockUser),
      });

      const result = await service.getUserProfile(userId);

      expect(result.username).toBe(mockUser.username);
      expect(result.phone).toBe(mockUser.phone);
    });

    it('throws BadRequestException when user not found', async () => {
      userModel.findById.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(service.getUserProfile(userId)).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
