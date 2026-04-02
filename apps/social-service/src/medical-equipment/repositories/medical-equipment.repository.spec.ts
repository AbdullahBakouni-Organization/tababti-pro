import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { MedicalEquipmentRepository } from './medical-equipment.repository';
import { MedicalEquipmentRequest } from '@app/common/database/schemas/medical_equipment_requests.schema';
import {
  EntityRequestStatus,
  UserRole,
  Machines,
} from '@app/common/database/schemas/common.enums';

describe('MedicalEquipmentRepository', () => {
  let repo: MedicalEquipmentRepository;

  const validId = new Types.ObjectId();
  const requesterId = new Types.ObjectId();

  const mockRequest = {
    _id: validId,
    requesterType: UserRole.DOCTOR,
    requesterId,
    equipmentType: Machines.MRIMachine,
    quantity: 1,
    status: EntityRequestStatus.PENDING,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockModel = {
    create: jest.fn(),
    findById: jest.fn(),
    find: jest.fn(),
    findByIdAndUpdate: jest.fn(),
    deleteOne: jest.fn(),
    countDocuments: jest.fn(),
    aggregate: jest.fn(),
    updateOne: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MedicalEquipmentRepository,
        {
          provide: getModelToken(MedicalEquipmentRequest.name),
          useValue: mockModel,
        },
      ],
    }).compile();

    repo = module.get<MedicalEquipmentRepository>(MedicalEquipmentRepository);
  });

  it('should be defined', () => {
    expect(repo).toBeDefined();
  });

  describe('createRequest()', () => {
    it('throws BadRequestException for invalid requesterId', async () => {
      await expect(
        repo.createRequest(UserRole.DOCTOR, 'bad-id', Machines.MRIMachine, 1),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates request with PENDING status', async () => {
      mockModel.create.mockResolvedValue(mockRequest);

      const result = await repo.createRequest(
        UserRole.DOCTOR,
        requesterId.toString(),
        Machines.MRIMachine,
        1,
      );

      expect(mockModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          requesterType: UserRole.DOCTOR,
          equipmentType: Machines.MRIMachine,
          quantity: 1,
          status: EntityRequestStatus.PENDING,
        }),
      );
      expect(result).toEqual(mockRequest);
    });
  });

  describe('findById()', () => {
    it('throws BadRequestException for invalid id', async () => {
      await expect(repo.findById('bad-id')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws NotFoundException when request not found', async () => {
      mockModel.findById.mockReturnValue({
        lean: jest.fn().mockResolvedValue(null),
      });
      await expect(repo.findById(validId.toString())).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns request when found', async () => {
      mockModel.findById.mockReturnValue({
        lean: jest.fn().mockResolvedValue(mockRequest),
      });

      const result = await repo.findById(validId.toString());
      expect(result).toEqual(mockRequest);
    });
  });

  describe('findByRequester()', () => {
    it('throws BadRequestException for invalid requesterId', async () => {
      await expect(
        repo.findByRequester(UserRole.DOCTOR, 'bad-id'),
      ).rejects.toThrow(BadRequestException);
    });

    it('returns requests without status filter', async () => {
      mockModel.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([mockRequest]),
      });

      const result = await repo.findByRequester(
        UserRole.DOCTOR,
        requesterId.toString(),
      );

      expect(mockModel.find).toHaveBeenCalledWith(
        expect.objectContaining({ requesterType: UserRole.DOCTOR }),
      );
      expect(result).toHaveLength(1);
    });

    it('filters by status when provided', async () => {
      mockModel.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([mockRequest]),
      });

      await repo.findByRequester(
        UserRole.DOCTOR,
        requesterId.toString(),
        EntityRequestStatus.PENDING,
      );

      expect(mockModel.find).toHaveBeenCalledWith(
        expect.objectContaining({ status: EntityRequestStatus.PENDING }),
      );
    });
  });
});
