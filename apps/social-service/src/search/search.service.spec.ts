import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { SearchService } from './search.service';
import { Doctor } from '@app/common/database/schemas/doctor.schema';
import { SearchOrchestratorService } from './orchestrators/search-orchestrator.service';
import { SearchVariantsCache } from './cache/search-variants.cache';
import { ApprovalStatus } from '@app/common/database/schemas/common.enums';

describe('SearchService', () => {
  let service: SearchService;
  let doctorModel: { findById: jest.Mock; find: jest.Mock; countDocuments: jest.Mock };
  let orchestrator: { searchAll: jest.Mock };
  let cache: { clear: jest.Mock };

  const doctorId = new Types.ObjectId().toString();
  const authAccountId = new Types.ObjectId().toString();

  const mockDoctor = {
    _id: new Types.ObjectId(doctorId),
    privateSpecialization: 'cardiology',
    firstName: 'Dr',
    lastName: 'Test',
  };

  beforeEach(async () => {
    doctorModel = {
      findById: jest.fn(),
      find: jest.fn(),
      countDocuments: jest.fn(),
    };
    orchestrator = { searchAll: jest.fn().mockResolvedValue({ data: [] }) };
    cache = { clear: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchService,
        { provide: SearchOrchestratorService, useValue: orchestrator },
        { provide: SearchVariantsCache, useValue: cache },
        { provide: getModelToken(Doctor.name), useValue: doctorModel },
      ],
    }).compile();

    service = module.get<SearchService>(SearchService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─── searchAll ─────────────────────────────────────────────────────────────

  describe('searchAll()', () => {
    it('delegates to orchestrator and returns results', async () => {
      const dto = { query: 'cardiologist' } as any;
      orchestrator.searchAll.mockResolvedValue({ doctors: [], total: 0 });

      const result = await service.searchAll(dto);

      expect(orchestrator.searchAll).toHaveBeenCalledWith(dto);
      expect(result).toBeDefined();
    });
  });

  // ─── clearCache ────────────────────────────────────────────────────────────

  describe('clearCache()', () => {
    it('clears search cache', () => {
      service.clearCache();
      expect(cache.clear).toHaveBeenCalled();
    });
  });

  // ─── getSimilarDoctors ─────────────────────────────────────────────────────

  describe('getSimilarDoctors()', () => {
    it('returns similar doctors with pagination metadata', async () => {
      doctorModel.findById.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(mockDoctor),
      });
      const mockResults = [{ _id: new Types.ObjectId(), firstName: 'Dr2', lastName: 'Similar' }];
      doctorModel.find.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(mockResults),
      });
      doctorModel.countDocuments.mockResolvedValue(1);

      const result = await service.getSimilarDoctors({ doctorId, page: 1, limit: 5 } as any, authAccountId);

      expect(result.doctors.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });

    it('throws NotFoundException when doctor not found', async () => {
      doctorModel.findById.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(
        service.getSimilarDoctors({ doctorId } as any, authAccountId),
      ).rejects.toThrow(NotFoundException);
    });

    it('filters by specialization and APPROVED status', async () => {
      doctorModel.findById.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(mockDoctor),
      });
      doctorModel.find.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([]),
      });
      doctorModel.countDocuments.mockResolvedValue(0);

      await service.getSimilarDoctors({ doctorId } as any, authAccountId);

      expect(doctorModel.find).toHaveBeenCalledWith(
        expect.objectContaining({
          status: ApprovalStatus.APPROVED,
          privateSpecialization: mockDoctor.privateSpecialization,
        }),
      );
    });
  });
});
