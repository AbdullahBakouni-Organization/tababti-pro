import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { PatientStatsCron } from './patient-stats.cron';
import { Doctor } from '@app/common/database/schemas/doctor.schema';
import { DoctorService } from '../doctor.service';
import { Types } from 'mongoose';
import { ApprovalStatus } from '@app/common/database/schemas/common.enums';

describe('PatientStatsCron', () => {
  let cron: PatientStatsCron;

  const doctorIds = [
    new Types.ObjectId(),
    new Types.ObjectId(),
    new Types.ObjectId(),
  ];

  const mockDoctors = doctorIds.map((id) => ({ _id: id }));

  const mockDoctorModel = {
    find: jest.fn(),
  };

  const mockDoctorService = {
    computeAndCacheStats: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PatientStatsCron,
        { provide: getModelToken(Doctor.name), useValue: mockDoctorModel },
        { provide: DoctorService, useValue: mockDoctorService },
      ],
    }).compile();

    cron = module.get<PatientStatsCron>(PatientStatsCron);
  });

  it('should be defined', () => {
    expect(cron).toBeDefined();
  });

  describe('refreshAllDoctorPatientStats()', () => {
    it('processes all active doctors and calls computeAndCacheStats for each', async () => {
      mockDoctorModel.find.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(mockDoctors),
      });

      await cron.refreshAllDoctorPatientStats();

      expect(mockDoctorModel.find).toHaveBeenCalledWith({
        status: ApprovalStatus.APPROVED,
      });
      expect(mockDoctorService.computeAndCacheStats).toHaveBeenCalledTimes(3);
      mockDoctors.forEach((doc) => {
        expect(mockDoctorService.computeAndCacheStats).toHaveBeenCalledWith(
          doc._id.toString(),
        );
      });
    });

    it('handles empty doctor list without errors', async () => {
      mockDoctorModel.find.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([]),
      });

      await expect(cron.refreshAllDoctorPatientStats()).resolves.not.toThrow();
      expect(mockDoctorService.computeAndCacheStats).not.toHaveBeenCalled();
    });

    it('continues processing even when some doctors fail', async () => {
      mockDoctorModel.find.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(mockDoctors),
      });

      mockDoctorService.computeAndCacheStats
        .mockResolvedValueOnce(undefined) // doctor 1 succeeds
        .mockRejectedValueOnce(new Error('DB error')) // doctor 2 fails
        .mockResolvedValueOnce(undefined); // doctor 3 succeeds

      await expect(cron.refreshAllDoctorPatientStats()).resolves.not.toThrow();
      // All 3 should still have been attempted
      expect(mockDoctorService.computeAndCacheStats).toHaveBeenCalledTimes(3);
    });

    it('processes doctors in batches of 10', async () => {
      // Create 15 doctors to test batching
      const fifteenDoctors = Array.from({ length: 15 }, () => ({
        _id: new Types.ObjectId(),
      }));

      mockDoctorModel.find.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(fifteenDoctors),
      });

      await cron.refreshAllDoctorPatientStats();

      expect(mockDoctorService.computeAndCacheStats).toHaveBeenCalledTimes(15);
    });
  });
});
