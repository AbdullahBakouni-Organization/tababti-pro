import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { DashboardService } from './dashboard.service.rest';
import { Booking } from '@app/common/database/schemas/booking.schema';
import { Doctor } from '@app/common/database/schemas/doctor.schema';
import { Question } from '@app/common/database/schemas/question.schema';
import { Answer } from '@app/common/database/schemas/answer.schema';
import { Post } from '@app/common/database/schemas/post.schema';
import { BookingStatus } from '@app/common/database/schemas/common.enums';
import { CacheService } from '@app/common/cache/cache.service';

describe('DashboardService', () => {
  let service: DashboardService;

  const authAccountId = new Types.ObjectId().toString();
  const doctorId = new Types.ObjectId();

  const mockDoctor = {
    _id: doctorId,
    authAccountId: new Types.ObjectId(authAccountId),
    firstName: 'Ali',
    middleName: 'Ahmad',
    lastName: 'Mahmoud',
    image: 'img.jpg',
  };

  const mockBookingModel = {
    aggregate: jest.fn(),
    find: jest.fn(),
    countDocuments: jest.fn(),
  };

  const mockDoctorModel = {
    findOne: jest.fn(),
    findById: jest.fn(),
    find: jest.fn(),
  };

  const mockQuestionModel = {
    aggregate: jest.fn().mockResolvedValue([]),
    countDocuments: jest.fn().mockResolvedValue(0),
  };

  const mockAnswerModel = {
    countDocuments: jest.fn().mockResolvedValue(0),
  };

  const mockPostModel = {
    countDocuments: jest.fn().mockResolvedValue(0),
    find: jest.fn(),
  };

  const mockCacheService = {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockCacheService.get.mockResolvedValue(null);
    mockCacheService.set.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        { provide: getModelToken(Booking.name), useValue: mockBookingModel },
        { provide: getModelToken(Doctor.name), useValue: mockDoctorModel },
        { provide: getModelToken(Question.name), useValue: mockQuestionModel },
        { provide: getModelToken(Answer.name), useValue: mockAnswerModel },
        { provide: getModelToken(Post.name), useValue: mockPostModel },
        { provide: CacheService, useValue: mockCacheService },
      ],
    }).compile();

    service = module.get<DashboardService>(DashboardService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('resolveDoctor()', () => {
    it('throws NotFoundException when doctor not found', async () => {
      mockDoctorModel.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(null),
      });

      await expect(service.resolveDoctor(authAccountId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns doctor when found', async () => {
      mockDoctorModel.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(mockDoctor),
      });

      const result = await service.resolveDoctor(authAccountId);
      expect(result).toEqual(mockDoctor);
    });
  });

  describe('getStats()', () => {
    it('throws NotFoundException when doctor not found', async () => {
      mockDoctorModel.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(null),
      });

      await expect(service.getStats(authAccountId, {})).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns zero stats when no bookings exist', async () => {
      mockDoctorModel.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(mockDoctor),
      });
      mockBookingModel.aggregate.mockResolvedValue([]);

      const result = await service.getStats(authAccountId, {});

      expect(result.totalAppointments).toBe(0);
      expect(result.completedAppointments).toBe(0);
      expect(result.estimatedRevenue).toBe(0);
    });

    it('calculates stats correctly from aggregate result', async () => {
      mockDoctorModel.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(mockDoctor),
      });
      mockBookingModel.aggregate
        .mockResolvedValueOnce([
          { _id: BookingStatus.COMPLETED, count: 5, revenue: 25000 },
          { _id: BookingStatus.CANCELLED_BY_PATIENT, count: 2, revenue: 0 },
        ])
        .mockResolvedValueOnce([{ _id: null, total: 15000 }]);

      const result = await service.getStats(authAccountId, {});

      expect(result.totalAppointments).toBe(7);
      expect(result.completedAppointments).toBe(5);
      expect(result.estimatedRevenue).toBe(25000);
    });

    it('computes weekly counts, revenue and percent changes', async () => {
      mockDoctorModel.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(mockDoctor),
      });
      mockBookingModel.aggregate
        // Current month (unused for weekly assertions)
        .mockResolvedValueOnce([])
        // Last month revenue
        .mockResolvedValueOnce([])
        // Current week
        .mockResolvedValueOnce([
          { _id: BookingStatus.COMPLETED, count: 6, revenue: 30000 },
          { _id: BookingStatus.CANCELLED_BY_PATIENT, count: 2, revenue: 0 },
        ])
        // Previous week
        .mockResolvedValueOnce([
          { _id: BookingStatus.COMPLETED, count: 4, revenue: 20000 },
          { _id: BookingStatus.CANCELLED_BY_PATIENT, count: 1, revenue: 0 },
        ]);

      const result = await service.getStats(authAccountId, {});

      expect(result.weeklyNewAppointments).toBe(8);
      expect(result.weeklyCompletedAppointments).toBe(6);
      expect(result.weeklyIncompleteAppointments).toBe(2);
      expect(result.weeklyRevenue).toBe(30000);
      // 8 vs 5 -> 60
      expect(result.totalAppointmentsChange).toBe(60);
      // 6 vs 4 -> 50
      expect(result.completedAppointmentsChange).toBe(50);
      // 2 vs 1 -> 100
      expect(result.incompleteAppointmentsChange).toBe(100);
      // 30000 vs 20000 -> 50
      expect(result.revenueChange).toBe(50);
    });

    it('returns 100 percent change when previous week is zero and current has data', async () => {
      mockDoctorModel.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(mockDoctor),
      });
      mockBookingModel.aggregate
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          { _id: BookingStatus.COMPLETED, count: 3, revenue: 9000 },
        ])
        .mockResolvedValueOnce([]);

      const result = await service.getStats(authAccountId, {});

      expect(result.totalAppointmentsChange).toBe(100);
      expect(result.completedAppointmentsChange).toBe(100);
      expect(result.revenueChange).toBe(100);
      // incomplete = 0 both weeks -> 0
      expect(result.incompleteAppointmentsChange).toBe(0);
    });
  });

  describe('getCacheInfo()', () => {
    it('returns null for both caches when not populated', () => {
      const result = service.getCacheInfo(doctorId.toString());

      expect(result.recentPatients).toBeNull();
      expect(result.locationChart).toBeNull();
    });
  });

  describe('getMonthlyIncome()', () => {
    beforeEach(() => {
      mockDoctorModel.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(mockDoctor),
      });
    });

    it('returns trailing months in chronological order with zero-filled gaps', async () => {
      mockBookingModel.aggregate.mockResolvedValue([]);

      const result = await service.getMonthlyIncome(authAccountId, {
        months: 3,
      });

      expect(result.months).toHaveLength(3);
      // Chronological order: oldest → newest
      for (let i = 1; i < result.months.length; i++) {
        const prev = result.months[i - 1];
        const curr = result.months[i];
        const prevAbs = prev.year * 12 + prev.monthIndex;
        const currAbs = curr.year * 12 + curr.monthIndex;
        expect(currAbs).toBe(prevAbs + 1);
      }
      // All zero-filled
      expect(result.months.every((m) => m.value === 0)).toBe(true);
      // Peak equals the most-recent bucket on ties.
      expect(result.peak.key).toBe(result.months[result.months.length - 1].key);
      expect(result.currency).toBe('USD');
    });

    it('maps English keys and Arabic labels to matching month indexes', async () => {
      mockBookingModel.aggregate.mockResolvedValue([]);

      const result = await service.getMonthlyIncome(authAccountId, {
        months: 12,
      });

      const EN = [
        'Jan',
        'Feb',
        'Mar',
        'Apr',
        'May',
        'Jun',
        'Jul',
        'Aug',
        'Sep',
        'Oct',
        'Nov',
        'Dec',
      ];
      const AR = [
        'كانون الثاني',
        'شباط',
        'آذار',
        'نيسان',
        'أيار',
        'حزيران',
        'تموز',
        'آب',
        'أيلول',
        'تشرين الأول',
        'تشرين الثاني',
        'كانون الأول',
      ];
      for (const bucket of result.months) {
        expect(bucket.key).toBe(EN[bucket.monthIndex]);
        expect(bucket.label).toBe(AR[bucket.monthIndex]);
      }
    });

    it('sums completed-only revenue per month and picks the peak', async () => {
      const now = new Date();
      const curY = now.getFullYear();
      const curMIdx = now.getMonth();
      // Previous month with proper year rollover.
      const prev = new Date(curY, curMIdx - 1, 1);
      const prevY = prev.getFullYear();
      const prevMIdx = prev.getMonth();

      // Aggregation returns year + 1-based month (Mongo $month convention).
      mockBookingModel.aggregate.mockResolvedValue([
        { _id: { y: curY, m: curMIdx + 1 }, total: 1000 },
        { _id: { y: prevY, m: prevMIdx + 1 }, total: 5000 },
      ]);

      const result = await service.getMonthlyIncome(authAccountId, {
        months: 2,
      });

      expect(result.months).toHaveLength(2);
      // Aggregation pipeline spec: match on COMPLETED only.
      const pipeline = mockBookingModel.aggregate.mock.calls[0][0];
      expect(pipeline[0].$match.status).toBe(BookingStatus.COMPLETED);
      // Peak value is the larger of the two (5000 — previous month).
      expect(result.peak.value).toBe(5000);
      expect(result.months[0].value).toBe(5000);
      expect(result.months[1].value).toBe(1000);
    });

    it('defaults months to 3 when not provided', async () => {
      mockBookingModel.aggregate.mockResolvedValue([]);

      const result = await service.getMonthlyIncome(authAccountId, {});

      expect(result.months).toHaveLength(3);
    });

    describe('caching', () => {
      it('returns cached value without hitting Mongo when present', async () => {
        const cachedPayload = {
          months: [],
          peak: { key: 'Jan', value: 0 },
          currency: 'USD',
        };
        mockCacheService.get.mockResolvedValueOnce(cachedPayload);

        const result = await service.getMonthlyIncome(authAccountId, {
          months: 6,
        });

        expect(result).toEqual(cachedPayload);
        expect(mockBookingModel.aggregate).not.toHaveBeenCalled();
        expect(mockCacheService.get).toHaveBeenCalledWith(
          `doctor:${doctorId.toString()}:income:monthly:6`,
        );
      });

      it('writes the computed result to cache with the 1h TTL keyed on doctorId+months', async () => {
        mockBookingModel.aggregate.mockResolvedValue([]);

        await service.getMonthlyIncome(authAccountId, { months: 6 });

        expect(mockCacheService.set).toHaveBeenCalledWith(
          `doctor:${doctorId.toString()}:income:monthly:6`,
          expect.objectContaining({ months: expect.any(Array) }),
          60 * 60,
        );
      });

      it('keys vary by months parameter so different windows do not collide', async () => {
        mockBookingModel.aggregate.mockResolvedValue([]);

        await service.getMonthlyIncome(authAccountId, { months: 3 });
        await service.getMonthlyIncome(authAccountId, { months: 12 });

        expect(mockCacheService.get).toHaveBeenCalledWith(
          `doctor:${doctorId.toString()}:income:monthly:3`,
        );
        expect(mockCacheService.get).toHaveBeenCalledWith(
          `doctor:${doctorId.toString()}:income:monthly:12`,
        );
      });
    });
  });

  describe('getDoctorDashboardById()', () => {
    it('throws BadRequestException for invalid doctor ID', async () => {
      await expect(
        service.getDoctorDashboardById('bad-id', {}),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when doctor not found by id', async () => {
      mockDoctorModel.findById.mockReturnValue({
        lean: jest.fn().mockResolvedValue(null),
      });

      await expect(
        service.getDoctorDashboardById(doctorId.toString(), {}),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
