import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import { DoctorRepository } from './profile.repository';
import { Doctor } from '@app/common/database/schemas/doctor.schema';

describe('DoctorRepository', () => {
  let repo: DoctorRepository;
  const validId = new Types.ObjectId();

  const mockDoctorModel = {
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
    deleteOne: jest.fn(),
    updateOne: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DoctorRepository,
        { provide: getModelToken(Doctor.name), useValue: mockDoctorModel },
      ],
    }).compile();

    repo = module.get<DoctorRepository>(DoctorRepository);
  });

  // ─── findByAuthAccountId ────────────────────────────────────────────────

  describe('findByAuthAccountId()', () => {
    it('throws BadRequestException for invalid id', async () => {
      await expect(repo.findByAuthAccountId('bad-id')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('returns doctor for valid id', async () => {
      const mockDoc = { _id: validId, firstName: 'Ali' };
      mockDoctorModel.findOne.mockReturnValue({
        select: jest
          .fn()
          .mockReturnValue({ lean: jest.fn().mockResolvedValue(mockDoc) }),
      });

      const result = await repo.findByAuthAccountId(validId.toString());
      expect(result).toEqual(mockDoc);
    });
  });

  // ─── updateByAuthAccountId ─────────────────────────────────────────────

  describe('updateByAuthAccountId()', () => {
    it('throws BadRequestException for invalid id', async () => {
      await expect(repo.updateByAuthAccountId('bad', {})).rejects.toThrow(
        BadRequestException,
      );
    });

    it('returns updated doctor', async () => {
      const updated = { _id: validId, firstName: 'Updated' };
      mockDoctorModel.findOneAndUpdate.mockReturnValue({
        lean: jest.fn().mockResolvedValue(updated),
      });

      const result = await repo.updateByAuthAccountId(validId.toString(), {
        firstName: 'Updated',
      } as any);
      expect(result).toEqual(updated);
    });
  });

  // ─── deleteById ────────────────────────────────────────────────────────

  describe('deleteById()', () => {
    it('throws BadRequestException for invalid id', async () => {
      await expect(repo.deleteById('bad')).rejects.toThrow(BadRequestException);
    });

    it('returns true when deleted', async () => {
      mockDoctorModel.deleteOne.mockResolvedValue({ deletedCount: 1 });
      const result = await repo.deleteById(validId.toString());
      expect(result).toBe(true);
    });

    it('returns false when not found', async () => {
      mockDoctorModel.deleteOne.mockResolvedValue({ deletedCount: 0 });
      const result = await repo.deleteById(validId.toString());
      expect(result).toBe(false);
    });
  });

  // ─── findById ──────────────────────────────────────────────────────────

  describe('findById()', () => {
    it('throws BadRequestException for invalid id', async () => {
      await expect(repo.findById('bad')).rejects.toThrow(BadRequestException);
    });

    it('returns doctor for valid id', async () => {
      const mockDoc = { _id: validId };
      mockDoctorModel.findOne.mockReturnValue({
        select: jest
          .fn()
          .mockReturnValue({ lean: jest.fn().mockResolvedValue(mockDoc) }),
      });
      const result = await repo.findById(validId.toString());
      expect(result).toEqual(mockDoc);
    });
  });

  // ─── incrementProfileViews ─────────────────────────────────────────────

  describe('incrementProfileViews()', () => {
    it('throws BadRequestException for invalid id', async () => {
      await expect(repo.incrementProfileViews('bad')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('calls updateOne with $inc', async () => {
      mockDoctorModel.updateOne.mockResolvedValue({ modifiedCount: 1 });
      await repo.incrementProfileViews(validId.toString());
      expect(mockDoctorModel.updateOne).toHaveBeenCalledWith(
        { _id: new Types.ObjectId(validId.toString()) },
        { $inc: { profileViews: 1 } },
      );
    });
  });

  // ─── checkPrivateSpecializationMatchesPublic ───────────────────────────

  describe('checkPrivateSpecializationMatchesPublic()', () => {
    it('returns boolean without throwing', () => {
      const result = repo.checkPrivateSpecializationMatchesPublic(
        'general' as any,
        'cardiology' as any,
      );
      expect(typeof result).toBe('boolean');
    });
  });
});
