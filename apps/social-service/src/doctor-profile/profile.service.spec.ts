import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { DoctorProfileService } from './profile.service';
import { DoctorRepository } from './profile.repository';
import { Post } from '@app/common/database/schemas/post.schema';
import { MinioService } from '@app/common/file-storage';
import { CacheService } from '@app/common/cache/cache.service';

jest.mock('@app/common/utils/cache-invalidation.util', () => ({
  invalidateMainProfileCaches: jest.fn().mockResolvedValue(undefined),
  invalidateProfileDoctorPostCaches: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@app/common/utils/upload-profile-images.util', () => ({
  uploadDoctorProfileImage: jest.fn().mockResolvedValue(undefined),
}));

describe('DoctorProfileService', () => {
  let service: DoctorProfileService;

  const authAccountId = new Types.ObjectId().toString();
  const doctorId = new Types.ObjectId().toString();

  const mockDoctor = {
    _id: new Types.ObjectId(doctorId),
    authAccountId: new Types.ObjectId(authAccountId),
    firstName: 'Ali',
    middleName: 'Ahmad',
    lastName: 'Mahmoud',
    gender: 'male',
    status: 'approved',
    city: 'Damascus',
    subcity: 'Mazzeh',
    publicSpecialization: 'general',
    privateSpecialization: 'cardiology',
    inspectionPrice: 5000,
    inspectionDuration: 30,
    image: 'img.jpg',
    imageBucket: 'doctors',
    imageFileName: 'img.jpg',
    phones: [],
    workingHours: [],
    gallery: [],
    experienceStartDate: new Date('2018-01-01'),
    yearsOfExperience: 6,
  };

  const mockRepo = {
    findByAuthAccountId: jest.fn(),
    findById: jest.fn(),
    updateByAuthAccountId: jest.fn(),
    deleteById: jest.fn(),
    incrementProfileViews: jest.fn(),
    checkPrivateSpecializationMatchesPublic: jest.fn().mockReturnValue(true),
  };

  const mockPostModel = {
    find: jest.fn(),
    countDocuments: jest.fn(),
  };

  const mockMinioService = {
    uploadFile: jest.fn(),
    deleteFile: jest.fn(),
  };

  const mockCacheService = {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    del: jest.fn(),
    reset: jest.fn(),
    invalidate: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DoctorProfileService,
        { provide: DoctorRepository, useValue: mockRepo },
        { provide: getModelToken(Post.name), useValue: mockPostModel },
        { provide: MinioService, useValue: mockMinioService },
        { provide: CacheService, useValue: mockCacheService },
      ],
    }).compile();

    service = module.get<DoctorProfileService>(DoctorProfileService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─── getProfile ────────────────────────────────────────────────────────

  describe('getProfile()', () => {
    it('throws NotFoundException when doctor not found', async () => {
      mockRepo.findByAuthAccountId.mockResolvedValue(null);
      await expect(service.getProfile(authAccountId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns cached result if available', async () => {
      mockRepo.findByAuthAccountId.mockResolvedValue(mockDoctor);
      mockCacheService.get.mockResolvedValue({ id: doctorId, fullName: 'Ali' });

      const result = await service.getProfile(authAccountId);
      expect(result).toEqual({ id: doctorId, fullName: 'Ali' });
      expect(mockCacheService.set).not.toHaveBeenCalled();
    });

    it('returns formatted profile and caches it', async () => {
      mockRepo.findByAuthAccountId.mockResolvedValue(mockDoctor);
      mockCacheService.get.mockResolvedValue(null);

      const result = await service.getProfile(authAccountId);
      expect(result).toHaveProperty('fullName');
      expect(mockCacheService.set).toHaveBeenCalled();
    });
  });

  // ─── getMainProfile ────────────────────────────────────────────────────

  describe('getMainProfile()', () => {
    it('throws NotFoundException when doctor not found', async () => {
      mockRepo.findByAuthAccountId.mockResolvedValue(null);
      await expect(service.getMainProfile(authAccountId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns image, gender and concatenated username', async () => {
      mockRepo.findByAuthAccountId.mockResolvedValue(mockDoctor);

      const result = await service.getMainProfile(authAccountId);

      expect(result).toEqual({
        image: 'img.jpg',
        gender: 'male',
        username: 'Ali Ahmad Mahmoud',
      });
    });

    it('omits empty name parts when building username', async () => {
      mockRepo.findByAuthAccountId.mockResolvedValue({
        ...mockDoctor,
        middleName: '',
        image: null,
      });

      const result = await service.getMainProfile(authAccountId);

      expect(result.username).toBe('Ali Mahmoud');
      expect(result.image).toBeNull();
    });
  });

  // ─── getProfileById ────────────────────────────────────────────────────

  describe('getProfileById()', () => {
    it('throws NotFoundException when doctor not found', async () => {
      mockRepo.findById.mockResolvedValue(null);
      await expect(service.getProfileById(doctorId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns formatted profile', async () => {
      mockRepo.findById.mockResolvedValue(mockDoctor);
      mockCacheService.get.mockResolvedValue(null);
      mockRepo.incrementProfileViews.mockResolvedValue(undefined);

      const result = await service.getProfileById(doctorId);
      expect(result).toHaveProperty('id');
      expect(mockCacheService.set).toHaveBeenCalled();
    });
  });

  // ─── updateProfile ────────────────────────────────────────────────────

  describe('updateProfile()', () => {
    it('throws NotFoundException when doctor not found', async () => {
      mockRepo.findByAuthAccountId.mockResolvedValue(null);
      await expect(
        service.updateProfile(authAccountId, {} as any, undefined),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException for mismatched specialization', async () => {
      mockRepo.findByAuthAccountId.mockResolvedValue(mockDoctor);
      mockRepo.checkPrivateSpecializationMatchesPublic.mockReturnValue(false);

      await expect(
        service.updateProfile(
          authAccountId,
          {
            publicSpecialization: 'general' as any,
            privateSpecialization: 'cardiology' as any,
          } as any,
          undefined,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for future experience date', async () => {
      mockRepo.findByAuthAccountId.mockResolvedValue(mockDoctor);

      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);

      await expect(
        service.updateProfile(
          authAccountId,
          {
            experienceStartDate: futureDate.toISOString() as any,
          } as any,
          undefined,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('updates and returns formatted profile', async () => {
      mockRepo.findByAuthAccountId.mockResolvedValue(mockDoctor);
      mockRepo.updateByAuthAccountId.mockResolvedValue({
        ...mockDoctor,
        firstName: 'Updated',
      });

      const result = await service.updateProfile(
        authAccountId,
        { firstName: 'Updated' } as any,
        undefined,
      );
      expect(result).toHaveProperty('fullName');
    });
  });

  // ─── deleteDoctor ──────────────────────────────────────────────────────

  describe('deleteDoctor()', () => {
    it('throws NotFoundException when not found', async () => {
      mockRepo.deleteById.mockResolvedValue(false);
      await expect(service.deleteDoctor(doctorId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('deletes successfully', async () => {
      mockRepo.deleteById.mockResolvedValue(true);
      await expect(service.deleteDoctor(doctorId)).resolves.toBeUndefined();
    });
  });

  // ─── getDoctorPosts ────────────────────────────────────────────────────

  describe('getDoctorPosts()', () => {
    it('returns posts from cache', async () => {
      const cached = { data: [], total: 0 };
      mockCacheService.get.mockResolvedValue(cached);

      const result = await service.getDoctorPosts(doctorId);
      expect(result).toEqual(cached);
    });

    it('returns posts from DB', async () => {
      mockCacheService.get.mockResolvedValue(null);
      mockRepo.findById.mockResolvedValue(mockDoctor);
      const mockPost = { _id: new Types.ObjectId(), title: 'Post 1' };
      mockPostModel.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([mockPost]),
      });
      mockPostModel.countDocuments.mockResolvedValue(1);

      const result = await service.getDoctorPosts(doctorId, 1, 10);
      expect(result.posts.data).toHaveLength(1);
    });
  });

  // ─── getDoctorGallery ─────────────────────────────────────────────────

  describe('getDoctorGallery()', () => {
    it('throws NotFoundException when doctor not found', async () => {
      mockRepo.findById.mockResolvedValue(null);
      await expect(service.getDoctorGallery(doctorId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns gallery from cache', async () => {
      mockRepo.findById.mockResolvedValue(mockDoctor);
      const cached = { data: { gallery: [] } };
      mockCacheService.get.mockResolvedValue(cached);

      const result = await service.getDoctorGallery(doctorId);
      expect(result).toEqual(cached);
    });

    it('returns empty gallery when doctor has no gallery', async () => {
      mockRepo.findById.mockResolvedValue({ ...mockDoctor, gallery: [] });
      mockCacheService.get.mockResolvedValue(null);

      const result = await service.getDoctorGallery(doctorId, 1, 10);
      expect(result.data.gallery).toHaveLength(0);
    });
  });
});
