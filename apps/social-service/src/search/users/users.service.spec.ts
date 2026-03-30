import { Test, TestingModule } from '@nestjs/testing';
import { UserService } from './users.service';
import { NearbyRepository } from './nearby-repository.service';
import { RoutingService } from './routing.service';
import { EntityMapper } from './entity-mapper.service';
import { NearbyCache } from './nearby-cache.service';

describe('UserService', () => {
  let service: UserService;

  const mockEntity = {
    _id: 'doc-1',
    name: 'Dr. Ahmad',
    lat: 33.5,
    lng: 36.3,
    durationMinutes: 10,
    distanceKm: 2,
  };

  const mockRepository = {
    getDoctorsInRadius: jest.fn().mockResolvedValue([]),
    getHospitalsInRadius: jest.fn().mockResolvedValue([]),
    getCentersInRadius: jest.fn().mockResolvedValue([]),
  };

  const mockRouting = {
    enrichWithMatrix: jest.fn().mockResolvedValue([]),
    loadRoutesInParallel: jest.fn().mockResolvedValue([]),
    queueCacheWarmup: jest.fn().mockResolvedValue(undefined),
  };

  const mockMapper = {
    toResponse: jest.fn().mockImplementation((e, _type) => ({
      ...e,
      durationMinutes: e.durationMinutes ?? 10,
    })),
  };

  const mockCache = {
    get: jest.fn().mockImplementation((_key, fn) => fn()),
    set: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
    clearMemory: jest.fn(),
    gridKey: jest
      .fn()
      .mockReturnValue('grid:33.5:36.3:req'),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        { provide: NearbyRepository, useValue: mockRepository },
        { provide: RoutingService, useValue: mockRouting },
        { provide: EntityMapper, useValue: mockMapper },
        { provide: NearbyCache, useValue: mockCache },
      ],
    }).compile();

    service = module.get<UserService>(UserService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('onModuleInit()', () => {
    it('logs initialization', () => {
      expect(() => service.onModuleInit()).not.toThrow();
    });
  });

  describe('getTravelModes()', () => {
    it('returns list of supported travel modes', () => {
      const modes = service.getTravelModes();
      expect(modes).toContain('driving-car');
      expect(modes).toContain('foot-walking');
      expect(modes.length).toBeGreaterThan(0);
    });
  });

  describe('invalidateDoctorCache()', () => {
    it('calls cache.del and cache.clearMemory', async () => {
      await service.invalidateDoctorCache();
      expect(mockCache.del).toHaveBeenCalledWith('doctors:all');
      expect(mockCache.clearMemory).toHaveBeenCalled();
    });
  });

  describe('invalidateHospitalCache()', () => {
    it('calls cache.clearMemory', () => {
      service.invalidateHospitalCache();
      expect(mockCache.clearMemory).toHaveBeenCalled();
    });
  });

  describe('findNearbyEntities()', () => {
    it('returns empty response when no entities found', async () => {
      mockRepository.getDoctorsInRadius.mockResolvedValue([]);
      mockRepository.getHospitalsInRadius.mockResolvedValue([]);
      mockRepository.getCentersInRadius.mockResolvedValue([]);

      const result = await service.findNearbyEntities(
        33.5, 36.3, 10, 1, 20, 'driving-car', false, 'all',
      );

      expect(result.doctors.data).toEqual([]);
      expect(result.hospitals.data).toEqual([]);
      expect(result.centers.data).toEqual([]);
      expect(result.meta.total).toBe(0);
    });

    it('fetches only doctors when entityType is "doctors"', async () => {
      mockRepository.getDoctorsInRadius.mockResolvedValue([mockEntity]);
      mockRouting.enrichWithMatrix.mockResolvedValue([mockEntity]);

      await service.findNearbyEntities(
        33.5, 36.3, 10, 1, 20, 'driving-car', false, 'doctors',
      );

      expect(mockRepository.getDoctorsInRadius).toHaveBeenCalled();
      expect(mockRepository.getHospitalsInRadius).not.toHaveBeenCalled();
      expect(mockRepository.getCentersInRadius).not.toHaveBeenCalled();
    });

    it('fetches only hospitals when entityType is "hospitals"', async () => {
      mockRepository.getHospitalsInRadius.mockResolvedValue([mockEntity]);
      mockRouting.enrichWithMatrix.mockResolvedValue([mockEntity]);

      await service.findNearbyEntities(
        33.5, 36.3, 10, 1, 20, 'driving-car', false, 'hospitals',
      );

      expect(mockRepository.getHospitalsInRadius).toHaveBeenCalled();
      expect(mockRepository.getDoctorsInRadius).not.toHaveBeenCalled();
    });

    it('fetches only centers when entityType is "centers"', async () => {
      mockRepository.getCentersInRadius.mockResolvedValue([mockEntity]);
      mockRouting.enrichWithMatrix.mockResolvedValue([mockEntity]);

      await service.findNearbyEntities(
        33.5, 36.3, 10, 1, 20, 'driving-car', false, 'centers',
      );

      expect(mockRepository.getCentersInRadius).toHaveBeenCalled();
      expect(mockRepository.getDoctorsInRadius).not.toHaveBeenCalled();
    });

    it('fetches all entity types when entityType is "all"', async () => {
      mockRepository.getDoctorsInRadius.mockResolvedValue([mockEntity]);
      mockRepository.getHospitalsInRadius.mockResolvedValue([mockEntity]);
      mockRepository.getCentersInRadius.mockResolvedValue([mockEntity]);
      mockRouting.enrichWithMatrix.mockResolvedValue([mockEntity]);

      const result = await service.findNearbyEntities(
        33.5, 36.3, 10, 1, 20, 'driving-car', false, 'all',
      );

      expect(mockRepository.getDoctorsInRadius).toHaveBeenCalled();
      expect(mockRepository.getHospitalsInRadius).toHaveBeenCalled();
      expect(mockRepository.getCentersInRadius).toHaveBeenCalled();
      expect(result.meta.total).toBeGreaterThan(0);
    });

    it('includes routes when includeRoutes is true', async () => {
      mockRepository.getDoctorsInRadius.mockResolvedValue([mockEntity]);
      mockRouting.enrichWithMatrix.mockResolvedValue([mockEntity]);
      mockRouting.loadRoutesInParallel.mockResolvedValue([mockEntity]);

      await service.findNearbyEntities(
        33.5, 36.3, 10, 1, 20, 'driving-car', true, 'doctors',
      );

      expect(mockRouting.loadRoutesInParallel).toHaveBeenCalled();
    });

    it('respects pagination - page 2 skips first batch', async () => {
      const entities = [
        { ...mockEntity, durationMinutes: 5 },
        { ...mockEntity, durationMinutes: 10 },
        { ...mockEntity, durationMinutes: 15 },
      ];
      mockRepository.getDoctorsInRadius.mockResolvedValue(entities);
      mockRouting.enrichWithMatrix.mockResolvedValue(entities);
      mockMapper.toResponse.mockImplementation((e) => e);

      const result = await service.findNearbyEntities(
        33.5, 36.3, 10, 2, 2, 'driving-car', false, 'doctors',
      );

      // page=2, limit=2 → skip first 2, get only the 3rd entity
      expect(result.doctors.data.length).toBe(1);
    });

    it('passes filters to repository', async () => {
      const filters = { cityId: 'city-1', gender: 'male' as any };
      mockRepository.getDoctorsInRadius.mockResolvedValue([]);

      await service.findNearbyEntities(
        33.5, 36.3, 10, 1, 20, 'driving-car', false, 'doctors', filters,
      );

      expect(mockRepository.getDoctorsInRadius).toHaveBeenCalledWith(
        33.5, 36.3, 10, filters,
      );
    });

    it('returns correct pagination meta', async () => {
      const entities = Array.from({ length: 5 }, (_, i) => ({
        ...mockEntity,
        durationMinutes: i + 1,
      }));
      mockRepository.getDoctorsInRadius.mockResolvedValue(entities);
      mockRouting.enrichWithMatrix.mockResolvedValue(entities);
      mockMapper.toResponse.mockImplementation((e) => e);

      const result = await service.findNearbyEntities(
        33.5, 36.3, 10, 1, 3, 'driving-car', false, 'doctors',
      );

      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBe(3);
      expect(result.meta.total).toBe(5);
      expect(result.meta.hasNextPage).toBe(true);
      expect(result.meta.hasPreviousPage).toBe(false);
    });
  });
});
