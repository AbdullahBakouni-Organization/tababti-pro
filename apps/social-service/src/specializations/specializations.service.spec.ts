import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { SpecializationsService } from './specializations.service';
import { PrivateSpecialization } from '@app/common/database/schemas/privatespecializations.schema';
import { PublicSpecialization } from '@app/common/database/schemas/publicspecializations.schema';
import { UnknownQuestion } from '@app/common/database/schemas/unknown.schema';
import { CacheService } from '@app/common/cache/cache.service';

describe('SpecializationsService', () => {
  let service: SpecializationsService;

  const specId = new Types.ObjectId();
  const pubSpecId = new Types.ObjectId();

  const mockSpec = { _id: specId, name: 'Cardiology' };
  const mockPubSpec = { _id: pubSpecId, name: 'General' };

  const mockSpecModel = {
    find: jest.fn(),
    findOne: jest.fn(),
    countDocuments: jest.fn(),
  };

  const mockPubSpecModel = {
    findOne: jest.fn(),
  };

  const mockUnknownModel = {
    findOne: jest.fn(),
  };

  const mockCacheService = {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SpecializationsService,
        {
          provide: getModelToken(PrivateSpecialization.name),
          useValue: mockSpecModel,
        },
        {
          provide: getModelToken(PublicSpecialization.name),
          useValue: mockPubSpecModel,
        },
        {
          provide: getModelToken(UnknownQuestion.name),
          useValue: mockUnknownModel,
        },
        { provide: CacheService, useValue: mockCacheService },
      ],
    }).compile();

    service = module.get<SpecializationsService>(SpecializationsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('validateAndGetIds()', () => {
    it('throws BadRequestException for empty ids array', async () => {
      await expect(service.validateAndGetIds([])).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException for invalid ObjectId', async () => {
      await expect(service.validateAndGetIds(['bad-id'])).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws NotFoundException when some IDs not found in DB', async () => {
      mockSpecModel.find.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([]), // nothing found
      });

      await expect(
        service.validateAndGetIds([specId.toString()]),
      ).rejects.toThrow(NotFoundException);
    });

    it('returns ObjectIds when all IDs are valid and found', async () => {
      mockSpecModel.find.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([mockSpec]),
      });

      const result = await service.validateAndGetIds([specId.toString()]);
      expect(result).toHaveLength(1);
    });
  });

  describe('getDropdownList()', () => {
    it('returns cached result when available', async () => {
      const cached = { specializations: { data: [] } };
      mockCacheService.get.mockResolvedValue(cached);

      const result = await service.getDropdownList();
      expect(result).toEqual(cached);
      expect(mockSpecModel.find).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when no specializations found', async () => {
      mockCacheService.get.mockResolvedValue(null);
      mockSpecModel.find.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([]),
      });
      mockUnknownModel.findOne.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(null),
      });

      await expect(service.getDropdownList()).rejects.toThrow(NotFoundException);
    });

    it('returns and caches specializations from DB', async () => {
      mockCacheService.get.mockResolvedValue(null);
      mockSpecModel.find.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([mockSpec]),
      });
      mockUnknownModel.findOne.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(null),
      });

      const result = await service.getDropdownList();
      expect(result).toHaveProperty('specializations');
      expect(mockCacheService.set).toHaveBeenCalled();
    });
  });

  describe('getPaginatedList()', () => {
    it('throws NotFoundException when no data found', async () => {
      mockSpecModel.find.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([]),
      });
      mockSpecModel.countDocuments.mockResolvedValue(0);

      await expect(service.getPaginatedList()).rejects.toThrow(NotFoundException);
    });

    it('returns paginated list', async () => {
      mockSpecModel.find.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([mockSpec]),
      });
      mockSpecModel.countDocuments.mockResolvedValue(1);

      const result = await service.getPaginatedList(1, 10);
      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
    });
  });

  describe('getEntities()', () => {
    it('returns array of entity objects with value and label', () => {
      const result = service.getEntities();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toHaveProperty('value');
      expect(result[0]).toHaveProperty('label');
    });
  });

  describe('getPrivateIdsByPublic()', () => {
    it('returns private specialization IDs by public ID', async () => {
      mockSpecModel.find.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([mockSpec]),
      });

      const result = await service.getPrivateIdsByPublic(pubSpecId.toString());
      expect(result).toHaveLength(1);
    });
  });

  describe('getPrivateIdsByPublicName()', () => {
    it('throws NotFoundException when public specialization not found', async () => {
      mockPubSpecModel.findOne.mockResolvedValue(null);

      await expect(
        service.getPrivateIdsByPublicName('NonExistent'),
      ).rejects.toThrow(NotFoundException);
    });

    it('returns private IDs when public name found', async () => {
      mockPubSpecModel.findOne.mockResolvedValue(mockPubSpec);
      mockSpecModel.find.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([mockSpec]),
      });

      const result = await service.getPrivateIdsByPublicName('General');
      expect(result).toHaveLength(1);
    });
  });

  describe('buildQuestionSpecializationMatch()', () => {
    it('returns null when no specialization provided', async () => {
      const result = await service.buildQuestionSpecializationMatch('');
      expect(result).toBeNull();
    });

    it('returns null when specialization not found in DB', async () => {
      mockSpecModel.findOne.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(null),
      });

      const result = await service.buildQuestionSpecializationMatch('Cardiology');
      expect(result).toBeNull();
    });

    it('returns match object when specialization found', async () => {
      mockSpecModel.findOne.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockSpec),
      });

      const result = await service.buildQuestionSpecializationMatch('Cardiology');
      expect(result).toHaveProperty('specializationId');
    });
  });
});
