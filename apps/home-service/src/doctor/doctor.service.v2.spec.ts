import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { DoctorBookingsQueryService } from './doctor.service.v2';
import { Booking } from '@app/common/database/schemas/booking.schema';
import { AppointmentSlot } from '@app/common/database/schemas/slot.schema';
import { User } from '@app/common/database/schemas/user.schema';
import { Doctor } from '@app/common/database/schemas/doctor.schema';
import { Post } from '@app/common/database/schemas/post.schema';
import { CacheService } from '@app/common/cache/cache.service';
import { KafkaService } from '@app/common/kafka/kafka.service';
import { MinioService } from '@app/common/file-storage';
import {
  BookingStatus,
  SlotStatus,
} from '@app/common/database/schemas/common.enums';

jest.mock('@app/common/utils/cache-invalidation.util', () => ({
  invalidateBookingCaches: jest.fn().mockResolvedValue(undefined),
  invalidateMainProfileCaches: jest.fn().mockResolvedValue(undefined),
  invalidateProfileDoctorGalleryCaches: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@app/common/utils/upload-profile-images.util', () => ({
  uploadDoctorProfileImage: jest.fn().mockResolvedValue(undefined),
}));

describe('DoctorBookingsQueryService', () => {
  let service: DoctorBookingsQueryService;

  const doctorId = new Types.ObjectId().toString();
  const bookingId = new Types.ObjectId().toString();
  const patientId = new Types.ObjectId();
  const slotId = new Types.ObjectId();

  const mockDoctor = {
    _id: new Types.ObjectId(doctorId),
    firstName: 'Ali',
    lastName: 'Ahmad',
    inspectionDuration: 30,
  };

  const mockBooking = {
    _id: new Types.ObjectId(bookingId),
    doctorId: new Types.ObjectId(doctorId),
    patientId,
    slotId,
    status: BookingStatus.PENDING,
    bookingDate: new Date(),
    bookingTime: '10:00',
    price: 5000,
  };

  const mockBookingModel = {
    find: jest.fn(),
    findById: jest.fn(),
    findOne: jest.fn(),
    countDocuments: jest.fn(),
    updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
    aggregate: jest.fn(),
  };

  const mockDoctorModel = {
    findById: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    countDocuments: jest.fn(),
  };

  const mockSlotModel = {
    findById: jest.fn(),
    updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
  };

  const mockUserModel = {
    findById: jest.fn(),
    findOne: jest.fn(),
  };

  const mockPostModel = {
    find: jest.fn(),
    countDocuments: jest.fn(),
  };

  const mockCacheService = {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
    invalidate: jest.fn().mockResolvedValue(undefined),
    invalidatePattern: jest.fn().mockResolvedValue(undefined),
  };

  const mockKafkaService = {
    emit: jest.fn().mockResolvedValue(undefined),
  };

  const mockMinioService = {
    uploadFile: jest.fn(),
    deleteFile: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DoctorBookingsQueryService,
        { provide: getModelToken(Booking.name), useValue: mockBookingModel },
        { provide: getModelToken(Doctor.name), useValue: mockDoctorModel },
        {
          provide: getModelToken(AppointmentSlot.name),
          useValue: mockSlotModel,
        },
        { provide: getModelToken(User.name), useValue: mockUserModel },
        { provide: getModelToken(Post.name), useValue: mockPostModel },
        { provide: CacheService, useValue: mockCacheService },
        { provide: KafkaService, useValue: mockKafkaService },
        { provide: MinioService, useValue: mockMinioService },
      ],
    }).compile();

    service = module.get<DoctorBookingsQueryService>(
      DoctorBookingsQueryService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getDoctorBookings()', () => {
    it('throws BadRequestException for invalid doctorId', async () => {
      await expect(
        service.getDoctorBookings({} as any, 'bad-id'),
      ).rejects.toThrow(BadRequestException);
    });

    it('returns cached result when available', async () => {
      const cachedResult = { bookings: [], pagination: {}, summary: {} };
      mockCacheService.get.mockResolvedValue(cachedResult);

      const result = await service.getDoctorBookings({} as any, doctorId);
      expect(result).toEqual(cachedResult);
      expect(mockBookingModel.find).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when doctor not found', async () => {
      mockCacheService.get.mockResolvedValue(null);
      mockDoctorModel.findById.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(
        service.getDoctorBookings({} as any, doctorId),
      ).rejects.toThrow(BadRequestException);
    });

    it('returns bookings from DB and caches them', async () => {
      mockCacheService.get.mockResolvedValue(null);
      mockDoctorModel.findById.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(mockDoctor),
      });
      mockBookingModel.countDocuments.mockResolvedValue(1);

      // Booking with populated slot location
      const populatedBooking = {
        ...mockBooking,
        slotId: {
          _id: slotId,
          date: new Date(),
          startTime: '10:00',
          endTime: '10:30',
          status: 'available',
          location: {
            type: 'PRIVATE',
            entity_name: 'Clinic',
            address: 'Damascus',
          },
        },
        patientId: {
          _id: patientId,
          username: 'patient1',
          phone: '0911111111',
          gender: 'male',
        },
      };

      mockBookingModel.find.mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([populatedBooking]),
      });
      mockBookingModel.aggregate.mockResolvedValue([]);

      const result = await service.getDoctorBookings(
        { page: 1, limit: 20 } as any,
        doctorId,
      );

      expect(result).toHaveProperty('bookings');
      expect(result).toHaveProperty('pagination');
      expect(mockCacheService.set).toHaveBeenCalled();
    });
  });

  describe('invalidateCache()', () => {
    it('calls cacheService.del with correct pattern', async () => {
      await service.invalidateCache(doctorId);
      expect(mockCacheService.del).toHaveBeenCalledWith(
        expect.stringContaining(doctorId),
      );
    });
  });

  describe('rescheduleBooking()', () => {
    it('throws NotFoundException when booking not found', async () => {
      mockBookingModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(
        service.rescheduleBooking(doctorId, { bookingId } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when booking belongs to another doctor', async () => {
      const otherDoctorId = new Types.ObjectId();
      mockBookingModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          ...mockBooking,
          doctorId: otherDoctorId,
        }),
      });

      await expect(
        service.rescheduleBooking(doctorId, { bookingId } as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws BadRequestException when booking status is not reschedulable', async () => {
      mockBookingModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          ...mockBooking,
          doctorId: new Types.ObjectId(doctorId),
          status: BookingStatus.COMPLETED,
        }),
      });

      await expect(
        service.rescheduleBooking(doctorId, { bookingId } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('successfully reschedules a PENDING booking', async () => {
      mockBookingModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          ...mockBooking,
          doctorId: new Types.ObjectId(doctorId),
          status: BookingStatus.PENDING,
        }),
      });
      mockUserModel.findById.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue({
          _id: patientId,
          username: 'patient',
          fcmToken: 'token',
        }),
      });
      mockDoctorModel.findById.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(mockDoctor),
      });

      const result = await service.rescheduleBooking(doctorId, {
        bookingId,
        newDate: '2025-06-01',
        newTime: '11:00',
        reason: 'Schedule conflict',
      } as any);

      expect(result).toHaveProperty('message');
      expect(mockSlotModel.updateOne).toHaveBeenCalled();
      expect(mockBookingModel.updateOne).toHaveBeenCalled();
    });
  });

  describe('getDoctorGalleryImages()', () => {
    it('throws BadRequestException for invalid doctor ID', async () => {
      await expect(service.getDoctorGalleryImages('bad-id')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('returns cached gallery when available', async () => {
      const cached = { data: { gallery: [], meta: {} } };
      mockCacheService.get.mockResolvedValue(cached);

      const result = await service.getDoctorGalleryImages(doctorId);
      expect(result).toEqual(cached);
    });

    it('throws NotFoundException when doctor not found', async () => {
      mockCacheService.get.mockResolvedValue(null);
      mockDoctorModel.findById.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(service.getDoctorGalleryImages(doctorId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns gallery images for a doctor', async () => {
      mockCacheService.get.mockResolvedValue(null);
      mockDoctorModel.findById.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue({
          ...mockDoctor,
          gallery: [
            {
              imageId: 'img-1',
              url: 'url1',
              fileName: 'f1.jpg',
              status: 'approved',
            },
          ],
        }),
      });

      const result = await service.getDoctorGalleryImages(doctorId);
      expect(result).toHaveProperty('data');
    });
  });

  describe('getDoctorPosts()', () => {
    it('returns posts for a doctor', async () => {
      mockCacheService.get.mockResolvedValue(null);
      mockPostModel.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([]),
      });
      mockPostModel.countDocuments.mockResolvedValue(0);
      mockDoctorModel.findOne.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockDoctor),
      });

      const result = await service.getDoctorPosts(doctorId, 1, 10);
      expect(result).toHaveProperty('data');
    });
  });

  describe('searchDoctorsByName()', () => {
    it('returns matched doctors', async () => {
      const mockResults = [
        {
          _id: new Types.ObjectId(),
          firstName: 'Ali',
          middleName: 'Ahmad',
          lastName: 'Hassan',
          image: null,
          publicSpecialization: 'general',
          privateSpecialization: 'cardiology',
          gender: 'male',
        },
      ];
      mockDoctorModel.find.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockResults),
      });
      mockDoctorModel.countDocuments.mockResolvedValue(1);

      const result = await service.searchDoctorsByName({
        name: 'Ali',
        page: '1',
        limit: '10',
      } as any);
      expect(result).toHaveProperty('doctors');
    });
  });
});
