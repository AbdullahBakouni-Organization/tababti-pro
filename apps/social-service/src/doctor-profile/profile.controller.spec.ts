import { Test, TestingModule } from '@nestjs/testing';
import { DoctorProfileController } from './profile.controller';
import { DoctorProfileService } from './profile.service';

describe('DoctorProfileController', () => {
  let controller: DoctorProfileController;

  const mockService = {
    getProfile: jest.fn(),
    updateProfile: jest.fn(),
    getProfileById: jest.fn(),
    getDoctorPosts: jest.fn(),
    getDoctorGallery: jest.fn(),
    deleteDoctor: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DoctorProfileController],
      providers: [{ provide: DoctorProfileService, useValue: mockService }],
    }).compile();

    controller = module.get<DoctorProfileController>(DoctorProfileController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getProfile()', () => {
    it('returns profile wrapped in ApiResponse', async () => {
      mockService.getProfile.mockResolvedValue({ id: '1', fullName: 'Ali' });
      const result = await controller.getProfile('auth-1', 'ar');
      expect(mockService.getProfile).toHaveBeenCalledWith('auth-1');
      expect(result).toHaveProperty('data');
    });
  });

  describe('getDoctorProfileById()', () => {
    it('delegates to service.getProfileById', async () => {
      mockService.getProfileById.mockResolvedValue({ id: '1' });
      const result = await controller.getDoctorProfileById('doc-1', 'en');
      expect(mockService.getProfileById).toHaveBeenCalledWith('doc-1');
      expect(result).toHaveProperty('data');
    });
  });

  describe('getDoctorPostsById()', () => {
    it('delegates to service.getDoctorPosts', async () => {
      mockService.getDoctorPosts.mockResolvedValue({ data: [], total: 0 });
      const result = await controller.getDoctorPostsById(
        'doc-1',
        { page: 1, limit: 10 } as any,
        'en',
      );
      expect(mockService.getDoctorPosts).toHaveBeenCalledWith('doc-1', 1, 10);
      expect(result).toEqual({ data: [], total: 0 });
    });
  });

  describe('getDoctorGalleryById()', () => {
    it('delegates to service.getDoctorGallery', async () => {
      mockService.getDoctorGallery.mockResolvedValue({ data: { gallery: [] } });
      const result = await controller.getDoctorGalleryById(
        'doc-1',
        { page: 1, limit: 10 } as any,
        'en',
      );
      expect(mockService.getDoctorGallery).toHaveBeenCalledWith('doc-1', 1, 10);
      expect(result).toHaveProperty('data');
    });
  });

  describe('deleteDoctor()', () => {
    it('calls service.deleteDoctor and returns success', async () => {
      mockService.deleteDoctor.mockResolvedValue(undefined);
      const result = await controller.deleteDoctor('doc-1', 'en');
      expect(mockService.deleteDoctor).toHaveBeenCalledWith('doc-1');
      expect(result).toHaveProperty('data', null);
    });
  });
});
