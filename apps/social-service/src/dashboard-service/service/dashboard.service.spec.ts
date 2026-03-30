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

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        { provide: getModelToken(Booking.name), useValue: mockBookingModel },
        { provide: getModelToken(Doctor.name), useValue: mockDoctorModel },
        { provide: getModelToken(Question.name), useValue: mockQuestionModel },
        { provide: getModelToken(Answer.name), useValue: mockAnswerModel },
        { provide: getModelToken(Post.name), useValue: mockPostModel },
      ],
    }).compile();

    service = module.get<DashboardService>(DashboardService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('resolveDoctor()', () => {
    it('throws NotFoundException when doctor not found', async () => {
      mockDoctorModel.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });

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
          { _id: BookingStatus.CANCELLED_BY_USER, count: 2, revenue: 0 },
        ])
        .mockResolvedValueOnce([{ _id: null, total: 15000 }]);

      const result = await service.getStats(authAccountId, {});

      expect(result.totalAppointments).toBe(7);
      expect(result.completedAppointments).toBe(5);
      expect(result.estimatedRevenue).toBe(25000);
    });
  });

  describe('getCacheInfo()', () => {
    it('returns null for both caches when not populated', () => {
      const result = service.getCacheInfo(doctorId.toString());

      expect(result.recentPatients).toBeNull();
      expect(result.locationChart).toBeNull();
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
