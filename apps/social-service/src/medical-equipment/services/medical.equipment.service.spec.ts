import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { MedicalEquipmentService } from './medical.equipment.service';
import { MedicalEquipmentRepository } from '../repositories/medical-equipment.repository';
import {
  UserRole,
  EntityRequestStatus,
  Machines,
} from '@app/common/database/schemas/common.enums';
import { Types } from 'mongoose';

describe('MedicalEquipmentService', () => {
  let service: MedicalEquipmentService;

  const requestId = new Types.ObjectId().toString();
  const requesterId = new Types.ObjectId().toString();

  const mockRequest = {
    _id: new Types.ObjectId(requestId),
    requesterType: UserRole.DOCTOR,
    requesterId: new Types.ObjectId(requesterId),
    equipmentType: Machines.MRIMachine,
    quantity: 1,
    status: EntityRequestStatus.PENDING,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockRepo = {
    createRequest: jest.fn(),
    findByRequester: jest.fn(),
    findById: jest.fn(),
    updateStatus: jest.fn(),
    deleteRequest: jest.fn(),
    findAll: jest.fn(),
    getStatistics: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MedicalEquipmentService,
        { provide: MedicalEquipmentRepository, useValue: mockRepo },
      ],
    }).compile();

    service = module.get<MedicalEquipmentService>(MedicalEquipmentService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─── createRequest ──────────────────────────────────────────────────────────

  describe('createRequest()', () => {
    const dto = { equipmentType: Machines.MRIMachine, quantity: 2 } as any;

    it('throws BadRequestException for invalid requesterType', async () => {
      await expect(
        service.createRequest(UserRole.USER, requesterId, dto),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for invalid equipment type', async () => {
      await expect(
        service.createRequest(UserRole.DOCTOR, requesterId, {
          equipmentType: 'INVALID' as any,
          quantity: 1,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for zero quantity', async () => {
      await expect(
        service.createRequest(UserRole.DOCTOR, requesterId, {
          equipmentType: Machines.MRIMachine,
          quantity: 0,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates request successfully', async () => {
      mockRepo.createRequest.mockResolvedValue(mockRequest);
      const result = await service.createRequest(
        UserRole.DOCTOR,
        requesterId,
        dto,
      );
      expect(result).toHaveProperty('id');
    });
  });

  // ─── getMyRequests ─────────────────────────────────────────────────────────

  describe('getMyRequests()', () => {
    it('returns paginated requests', async () => {
      mockRepo.findByRequester.mockResolvedValue([mockRequest]);
      const result = await service.getMyRequests(
        UserRole.DOCTOR,
        requesterId,
        undefined,
        1,
        10,
      );
      expect(result.requests).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('returns empty when no requests', async () => {
      mockRepo.findByRequester.mockResolvedValue([]);
      const result = await service.getMyRequests(UserRole.DOCTOR, requesterId);
      expect(result.requests).toHaveLength(0);
    });
  });

  // ─── getRequest ────────────────────────────────────────────────────────────

  describe('getRequest()', () => {
    it('throws ForbiddenException when not owner', async () => {
      mockRepo.findById.mockResolvedValue({
        ...mockRequest,
        requesterType: UserRole.HOSPITAL,
        requesterId: new Types.ObjectId(),
      });
      await expect(
        service.getRequest(requestId, UserRole.DOCTOR, requesterId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('returns request when owner', async () => {
      mockRepo.findById.mockResolvedValue(mockRequest);
      const result = await service.getRequest(
        requestId,
        UserRole.DOCTOR,
        requesterId,
      );
      expect(result).toHaveProperty('id');
    });

    it('allows admin to view any request', async () => {
      mockRepo.findById.mockResolvedValue({
        ...mockRequest,
        requesterId: new Types.ObjectId(),
      });
      const result = await service.getRequest(
        requestId,
        UserRole.DOCTOR,
        'other',
        true,
      );
      expect(result).toHaveProperty('id');
    });
  });
});
