import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import { EntityProfileRepository } from './entity-profile.repository';
import { Doctor } from '@app/common/database/schemas/doctor.schema';
import { Hospital } from '@app/common/database/schemas/hospital.schema';
import { Center } from '@app/common/database/schemas/center.schema';
import { CommonDepartment } from '@app/common/database/schemas/common_departments.schema';

describe('EntityProfileRepository', () => {
  let repo: EntityProfileRepository;
  const validId = new Types.ObjectId();

  const makeLeanChain = (value: any) => ({
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(value),
  });

  const makeFindLeanChain = (value: any[]) => ({
    lean: jest.fn().mockResolvedValue(value),
  });

  const mockDoctorModel = {
    findOne: jest.fn(),
    updateOne: jest.fn().mockResolvedValue(undefined),
  };

  const mockHospitalModel = {
    findOne: jest.fn(),
    updateOne: jest.fn().mockResolvedValue(undefined),
  };

  const mockCenterModel = {
    findOne: jest.fn(),
    updateOne: jest.fn().mockResolvedValue(undefined),
  };

  const mockDepartmentModel = {
    find: jest.fn(),
    findOne: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EntityProfileRepository,
        { provide: getModelToken(Doctor.name), useValue: mockDoctorModel },
        { provide: getModelToken(Hospital.name), useValue: mockHospitalModel },
        { provide: getModelToken(Center.name), useValue: mockCenterModel },
        {
          provide: getModelToken(CommonDepartment.name),
          useValue: mockDepartmentModel,
        },
      ],
    }).compile();

    repo = module.get<EntityProfileRepository>(EntityProfileRepository);
  });

  it('should be defined', () => {
    expect(repo).toBeDefined();
  });

  describe('findDoctorById()', () => {
    it('throws BadRequestException for invalid id', async () => {
      await expect(repo.findDoctorById('bad-id')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('returns doctor for valid id', async () => {
      const mockDoc = { _id: validId, firstName: 'Ali', status: 'approved' };
      mockDoctorModel.findOne.mockReturnValue(makeLeanChain(mockDoc));

      const result = await repo.findDoctorById(validId.toString());
      expect(result).toEqual(mockDoc);
    });
  });

  describe('findHospitalById()', () => {
    it('throws BadRequestException for invalid id', async () => {
      await expect(repo.findHospitalById('bad-id')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('returns hospital for valid id', async () => {
      const mockDoc = { _id: validId, name: 'Hospital A', status: 'approved' };
      mockHospitalModel.findOne.mockReturnValue(makeLeanChain(mockDoc));

      const result = await repo.findHospitalById(validId.toString());
      expect(result).toEqual(mockDoc);
    });
  });

  describe('findCenterById()', () => {
    it('throws BadRequestException for invalid id', async () => {
      await expect(repo.findCenterById('bad-id')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('returns center for valid id', async () => {
      const mockDoc = {
        _id: validId,
        name: 'Center B',
        approvalStatus: 'approved',
      };
      mockCenterModel.findOne.mockReturnValue(makeLeanChain(mockDoc));

      const result = await repo.findCenterById(validId.toString());
      expect(result).toEqual(mockDoc);
    });
  });

  describe('findHospitalDepartments()', () => {
    it('throws BadRequestException for invalid id', async () => {
      await expect(repo.findHospitalDepartments('bad')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('returns departments for hospital', async () => {
      const deps = [{ _id: new Types.ObjectId(), name: 'Cardiology' }];
      mockDepartmentModel.find.mockReturnValue(makeFindLeanChain(deps));

      const result = await repo.findHospitalDepartments(validId.toString());
      expect(result).toEqual(deps);
    });
  });

  describe('findCenterDepartments()', () => {
    it('throws BadRequestException for invalid id', async () => {
      await expect(repo.findCenterDepartments('bad')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('returns departments for center', async () => {
      const deps = [{ _id: new Types.ObjectId(), name: 'Radiology' }];
      mockDepartmentModel.find.mockReturnValue(makeFindLeanChain(deps));

      const result = await repo.findCenterDepartments(validId.toString());
      expect(result).toEqual(deps);
    });
  });

  describe('incrementDoctorViews()', () => {
    it('throws BadRequestException for invalid id', async () => {
      await expect(repo.incrementDoctorViews('bad')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('calls updateOne with $inc profileViews', async () => {
      await repo.incrementDoctorViews(validId.toString());
      expect(mockDoctorModel.updateOne).toHaveBeenCalledWith(
        { _id: new Types.ObjectId(validId.toString()) },
        { $inc: { profileViews: 1 } },
      );
    });
  });
});
