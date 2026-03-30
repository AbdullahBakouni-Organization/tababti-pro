import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { EntityProfileService } from './entity-profile.service';
import { EntityProfileRepository } from './entity-profile.repository';
import { Post } from '@app/common/database/schemas/post.schema';
import { CommonDepartment } from '@app/common/database/schemas/common_departments.schema';
import { CacheService } from '@app/common/cache/cache.service';
import { UserRole, GalleryImageStatus } from '@app/common/database/schemas/common.enums';

describe('EntityProfileService', () => {
  let service: EntityProfileService;

  const doctorId = new Types.ObjectId().toString();
  const hospitalId = new Types.ObjectId().toString();
  const centerId = new Types.ObjectId().toString();

  const mockDoctor = {
    _id: new Types.ObjectId(doctorId),
    firstName: 'Ali',
    middleName: 'Ahmad',
    lastName: 'Mahmoud',
    status: 'approved',
    gender: 'male',
    city: 'Damascus',
    subcity: 'Mazzeh',
    publicSpecialization: 'general',
    privateSpecialization: 'cardiology',
    inspectionPrice: 5000,
    inspectionDuration: 30,
    image: 'img.jpg',
    phones: [{ number: '0911111111' }],
    workingHours: [],
    gallery: [
      {
        imageId: 'img-1',
        url: 'url1',
        fileName: 'f1.jpg',
        status: GalleryImageStatus.APPROVED,
        uploadedAt: new Date(),
        approvedAt: new Date(),
      },
    ],
    experienceStartDate: new Date('2018-01-01'),
    yearsOfExperience: 6,
  };

  const mockHospital = {
    _id: new Types.ObjectId(hospitalId),
    name: 'Hospital A',
    status: 'approved',
    city: 'Damascus',
    gallery: [],
    phones: [],
  };

  const mockCenter = {
    _id: new Types.ObjectId(centerId),
    name: 'Center B',
    approvalStatus: 'approved',
    city: 'Aleppo',
    gallery: [],
    phones: [],
  };

  const mockRepo = {
    findDoctorById: jest.fn(),
    findHospitalById: jest.fn(),
    findCenterById: jest.fn(),
    findHospitalDepartments: jest.fn().mockResolvedValue([]),
    findCenterDepartments: jest.fn().mockResolvedValue([]),
    incrementDoctorViews: jest.fn().mockResolvedValue(undefined),
    incrementHospitalViews: jest.fn().mockResolvedValue(undefined),
    incrementCenterViews: jest.fn().mockResolvedValue(undefined),
  };

  const mockPostModel = {
    find: jest.fn(),
    countDocuments: jest.fn().mockResolvedValue(0),
  };

  const mockDepartmentModel = {
    find: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }),
  };

  const mockCacheService = {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EntityProfileService,
        { provide: EntityProfileRepository, useValue: mockRepo },
        { provide: getModelToken(Post.name), useValue: mockPostModel },
        {
          provide: getModelToken(CommonDepartment.name),
          useValue: mockDepartmentModel,
        },
        { provide: CacheService, useValue: mockCacheService },
      ],
    }).compile();

    service = module.get<EntityProfileService>(EntityProfileService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getEntityProfile() for DOCTOR', () => {
    it('throws NotFoundException when doctor not found', async () => {
      mockRepo.findDoctorById.mockResolvedValue(null);
      await expect(
        service.getEntityProfile(doctorId, UserRole.DOCTOR),
      ).rejects.toThrow(NotFoundException);
    });

    it('returns cached profile when both profile and gallery are cached', async () => {
      const cachedProfile = { type: UserRole.DOCTOR, id: doctorId, fullName: 'Ali Ahmad Mahmoud' };
      const cachedGallery = { data: [], meta: {} };
      mockCacheService.get
        .mockResolvedValueOnce(cachedProfile)
        .mockResolvedValueOnce(cachedGallery);

      const result = await service.getEntityProfile(doctorId, UserRole.DOCTOR);
      expect(result).toEqual({ ...cachedProfile, gallery: cachedGallery });
      expect(mockRepo.findDoctorById).not.toHaveBeenCalled();
    });

    it('returns doctor profile from db and caches it', async () => {
      mockRepo.findDoctorById.mockResolvedValue(mockDoctor);
      mockPostModel.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([]),
      });
      mockPostModel.countDocuments.mockResolvedValue(0);

      const result = await service.getEntityProfile(doctorId, UserRole.DOCTOR);

      expect(result).toHaveProperty('type', UserRole.DOCTOR);
      expect(result).toHaveProperty('fullName');
      expect(mockCacheService.set).toHaveBeenCalled();
      expect(mockRepo.incrementDoctorViews).toHaveBeenCalledWith(doctorId);
    });
  });

  describe('getEntityProfile() for HOSPITAL', () => {
    it('throws NotFoundException when hospital not found', async () => {
      mockRepo.findHospitalById.mockResolvedValue(null);
      await expect(
        service.getEntityProfile(hospitalId, UserRole.HOSPITAL),
      ).rejects.toThrow(NotFoundException);
    });

    it('returns hospital profile from db', async () => {
      mockRepo.findHospitalById.mockResolvedValue(mockHospital);
      mockPostModel.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([]),
      });
      mockPostModel.countDocuments.mockResolvedValue(0);

      const result = await service.getEntityProfile(hospitalId, UserRole.HOSPITAL);
      expect(result).toHaveProperty('type', UserRole.HOSPITAL);
    });
  });

  describe('getEntityProfile() for CENTER', () => {
    it('throws NotFoundException when center not found', async () => {
      mockRepo.findCenterById.mockResolvedValue(null);
      await expect(
        service.getEntityProfile(centerId, UserRole.CENTER),
      ).rejects.toThrow(NotFoundException);
    });

    it('returns center profile from db', async () => {
      mockRepo.findCenterById.mockResolvedValue(mockCenter);
      mockPostModel.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([]),
      });
      mockPostModel.countDocuments.mockResolvedValue(0);

      const result = await service.getEntityProfile(centerId, UserRole.CENTER);
      expect(result).toHaveProperty('type', UserRole.CENTER);
    });
  });
});
