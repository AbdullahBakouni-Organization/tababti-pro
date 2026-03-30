import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import { NearbyBookingService } from './nearby-booking.service';
import { NearbyBookingRepository } from './nearby-booking.repository';
import { CacheService } from '@app/common/cache/cache.service';

describe('NearbyBookingService', () => {
  let service: NearbyBookingService;

  const authId = new Types.ObjectId().toString();

  const mockRepo = {
    findTopDoctors: jest.fn(),
    findNextBookingForUser: jest.fn(),
    findNextBookingsForUser: jest.fn(),
    findNextBookingForDoctor: jest.fn(),
    findNextBookingsForDoctor: jest.fn(),
    findUserByAuthAccountId: jest.fn(),
    findDoctorByAuthAccountId: jest.fn(),
    findAllBookingsForUser: jest.fn(),
    findDoctorPatients: jest.fn(),
    findMyAppointments: jest.fn(),
    searchDoctorPatients: jest.fn(),
    findPatientDetail: jest.fn(),
    incrementDoctorSearchCount: jest.fn().mockResolvedValue(undefined),
    incrementBookingCount: jest.fn().mockResolvedValue(undefined),
    decrementBookingCount: jest.fn().mockResolvedValue(undefined),
  };

  const mockCacheService = {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    del: jest.fn(),
    invalidate: jest.fn().mockResolvedValue(undefined),
    invalidatePattern: jest.fn().mockResolvedValue(undefined),
    keys: jest.fn().mockResolvedValue([]),
    reset: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NearbyBookingService,
        { provide: NearbyBookingRepository, useValue: mockRepo },
        { provide: CacheService, useValue: mockCacheService },
      ],
    }).compile();

    service = module.get<NearbyBookingService>(NearbyBookingService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getTopDoctors()', () => {
    it('returns cached result', async () => {
      const cached = [{ doctorId: '1', count: 5 }];
      mockCacheService.get.mockResolvedValue(cached);
      const result = await service.getTopDoctors(1, 10);
      expect(result).toEqual(cached);
      expect(mockRepo.findTopDoctors).not.toHaveBeenCalled();
    });

    it('fetches from repo when cache is empty', async () => {
      mockCacheService.get.mockResolvedValue(null);
      const data = [{ doctorId: '1', count: 5 }];
      mockRepo.findTopDoctors.mockResolvedValue(data);
      const result = await service.getTopDoctors(1, 10);
      expect(result).toEqual(data);
      expect(mockCacheService.set).toHaveBeenCalled();
    });
  });

  describe('getNextBookingForUser()', () => {
    it('throws BadRequestException for invalid authAccountId', async () => {
      await expect(service.getNextBookingForUser('bad-id', 1, 10)).rejects.toThrow(BadRequestException);
    });

    it('returns cached result without calling repo', async () => {
      const cached = { bookings: [] };
      mockCacheService.get.mockResolvedValue(cached);
      mockRepo.findUserByAuthAccountId.mockResolvedValue({ _id: new Types.ObjectId() });
      const result = await service.getNextBookingForUser(authId, 1, 10);
      // When cache exists, repo should NOT be called
      expect(mockRepo.findNextBookingsForUser).not.toHaveBeenCalled();
    });

    it('fetches from repo when cache is empty', async () => {
      mockCacheService.get.mockResolvedValue(null);
      const mockUser = { _id: new Types.ObjectId() };
      mockRepo.findUserByAuthAccountId.mockResolvedValue(mockUser);
      const data = [{ _id: new Types.ObjectId(), status: 'pending' }];
      mockRepo.findNextBookingsForUser.mockResolvedValue(data);
      await service.getNextBookingForUser(authId, 1, 10);
      expect(mockRepo.findNextBookingsForUser).toHaveBeenCalled();
    });
  });

  describe('getNextBookingForDoctor()', () => {
    it('throws BadRequestException for invalid authAccountId', async () => {
      await expect(service.getNextBookingForDoctor('bad', 1, 10)).rejects.toThrow(BadRequestException);
    });

    it('returns from repo when cache is empty', async () => {
      mockCacheService.get.mockResolvedValue(null);
      mockRepo.findDoctorByAuthAccountId.mockResolvedValue({ _id: new Types.ObjectId() });
      mockRepo.findNextBookingsForDoctor.mockResolvedValue([]);
      await service.getNextBookingForDoctor(authId, 1, 10);
      expect(mockRepo.findNextBookingsForDoctor).toHaveBeenCalled();
    });
  });

  describe('getAllBookingsForUser()', () => {
    it('throws BadRequestException for invalid authAccountId', async () => {
      await expect(service.getAllBookingsForUser('bad', undefined, 1, 10)).rejects.toThrow(BadRequestException);
    });

    it('returns bookings from repo', async () => {
      mockCacheService.get.mockResolvedValue(null);
      const mockUser = { _id: new Types.ObjectId(), authAccountId: authId };
      mockRepo.findUserByAuthAccountId.mockResolvedValue(mockUser);
      mockRepo.findAllBookingsForUser.mockResolvedValue({ data: [], total: 0 });
      await service.getAllBookingsForUser(authId, undefined, 1, 10);
      expect(mockRepo.findAllBookingsForUser).toHaveBeenCalled();
    });
  });

  describe('getDoctorPatients()', () => {
    it('throws BadRequestException for invalid authAccountId', async () => {
      await expect(
        service.getDoctorPatients('bad', {} as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when doctor not found', async () => {
      mockRepo.findDoctorByAuthAccountId.mockResolvedValue(null);
      await expect(
        service.getDoctorPatients(authId, {} as any),
      ).rejects.toThrow();
    });

    it('returns patients from repo', async () => {
      mockRepo.findDoctorByAuthAccountId.mockResolvedValue({
        _id: new Types.ObjectId(),
      });
      const patientsData = { data: [], total: 0 };
      mockRepo.findDoctorPatients.mockResolvedValue(patientsData);

      const result = await service.getDoctorPatients(authId, {} as any);
      expect(mockRepo.findDoctorPatients).toHaveBeenCalled();
    });
  });

  describe('getMyAppointments()', () => {
    it('throws BadRequestException for invalid authAccountId', async () => {
      await expect(
        service.getMyAppointments('bad', {} as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('returns cached appointments', async () => {
      const cached = { appointments: [] };
      mockCacheService.get.mockResolvedValue(cached);
      mockRepo.findDoctorByAuthAccountId.mockResolvedValue({
        _id: new Types.ObjectId(),
      });

      const result = await service.getMyAppointments(authId, {} as any);
      expect(result).toEqual(cached);
      expect(mockRepo.findMyAppointments).not.toHaveBeenCalled();
    });

    it('fetches from repo when cache is empty', async () => {
      mockCacheService.get.mockResolvedValue(null);
      mockRepo.findDoctorByAuthAccountId.mockResolvedValue({
        _id: new Types.ObjectId(),
      });
      const data = { appointments: [], total: 0 };
      mockRepo.findMyAppointments.mockResolvedValue(data);

      await service.getMyAppointments(authId, {} as any);
      expect(mockRepo.findMyAppointments).toHaveBeenCalled();
      expect(mockCacheService.set).toHaveBeenCalled();
    });
  });

  describe('getAllBookingsForUser() - status validation', () => {
    it('throws BadRequestException for invalid status', async () => {
      mockRepo.findUserByAuthAccountId.mockResolvedValue({
        _id: new Types.ObjectId(),
      });
      await expect(
        service.getAllBookingsForUser(authId, 'INVALID_STATUS', 1, 10),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('onDoctorSearched()', () => {
    it('invalidates top-doctors cache pattern', async () => {
      await service.onDoctorSearched();
      expect(mockCacheService.invalidatePattern).toHaveBeenCalledWith(
        expect.stringContaining('booking:top-doctors'),
      );
    });
  });

  describe('onBookingCreated()', () => {
    it('invalidates relevant cache patterns', async () => {
      await service.onBookingCreated(authId, authId);
      expect(mockCacheService.invalidatePattern).toHaveBeenCalledTimes(4);
    });
  });

  describe('onBookingCancelled()', () => {
    it('invalidates all relevant cache patterns', async () => {
      await service.onBookingCancelled(authId, authId);
      expect(mockCacheService.invalidatePattern).toHaveBeenCalledTimes(6);
    });
  });

  describe('onBookingConfirmed()', () => {
    it('invalidates relevant cache patterns', async () => {
      await service.onBookingConfirmed(authId, authId);
      expect(mockCacheService.invalidatePattern).toHaveBeenCalledTimes(3);
    });
  });

  describe('onBookingCompleted()', () => {
    it('invalidates all relevant cache patterns', async () => {
      await service.onBookingCompleted(authId, authId);
      expect(mockCacheService.invalidatePattern).toHaveBeenCalledTimes(7);
    });
  });

  describe('onBookingRescheduled()', () => {
    it('invalidates all relevant cache patterns', async () => {
      await service.onBookingRescheduled(authId, authId);
      expect(mockCacheService.invalidatePattern).toHaveBeenCalledTimes(6);
    });
  });
});
