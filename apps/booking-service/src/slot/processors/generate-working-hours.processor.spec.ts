import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { SlotGenerationProcessor } from './generate-working-hours.processor';
import { AppointmentSlot } from '@app/common/database/schemas/slot.schema';
import { Days, WorkigEntity } from '@app/common/database/schemas/common.enums';
import { CacheService } from '@app/common/cache/cache.service';

describe('SlotGenerationProcessor', () => {
  let processor: SlotGenerationProcessor;

  const mockSlotModel = {
    find: jest.fn(),
    insertMany: jest.fn(),
    deleteMany: jest.fn(),
    create: jest.fn(),
    bulkWrite: jest.fn(),
  };

  const mockCacheService = {
    acquireLock: jest.fn().mockResolvedValue(true),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockCacheService.acquireLock.mockResolvedValue(true);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SlotGenerationProcessor,
        {
          provide: getModelToken(AppointmentSlot.name),
          useValue: mockSlotModel,
        },
        { provide: CacheService, useValue: mockCacheService },
      ],
    }).compile();

    processor = module.get<SlotGenerationProcessor>(SlotGenerationProcessor);
  });

  it('should be defined', () => {
    expect(processor).toBeDefined();
  });

  describe('handleSlotGeneration()', () => {
    const doctorId = new Types.ObjectId().toString();

    const mockJob = {
      id: 'job-1',
      data: {
        eventType: 'SLOTS_GENERATE' as const,
        timestamp: new Date().toISOString(),
        doctorId,
        WorkingHours: [
          {
            day: Days.MONDAY,
            location: {
              type: WorkigEntity.CLINIC,
              entity_name: 'Clinic A',
              address: 'Addr 1',
            },
            startTime: '09:00',
            endTime: '17:00',
          },
        ],
        inspectionDuration: 30,
        inspectionPrice: 5000,
        doctorInfo: { fullName: 'Dr. Ali' },
      },
      progress: jest.fn().mockResolvedValue(undefined),
      log: jest.fn(),
    };

    it('processes job without throwing', async () => {
      mockSlotModel.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue([]),
      });
      mockSlotModel.insertMany.mockResolvedValue([]);

      await expect(
        processor.handleSlotGeneration(mockJob as any),
      ).resolves.toBeUndefined();
    });

    it('calls job.progress during processing', async () => {
      mockSlotModel.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue([]),
      });
      mockSlotModel.insertMany.mockResolvedValue([]);

      await processor.handleSlotGeneration(mockJob as any);
      expect(mockJob.progress).toHaveBeenCalled();
    });
  });

  // ─── Idempotency Lock ─────────────────────────────────────────────────────

  describe('Redis idempotency lock', () => {
    const doctorId = new Types.ObjectId().toString();

    const baseJob = {
      id: 'job-lock-1',
      data: {
        eventType: 'SLOTS_GENERATE' as const,
        timestamp: new Date().toISOString(),
        doctorId,
        WorkingHours: [
          {
            day: Days.MONDAY,
            location: {
              type: WorkigEntity.CLINIC,
              entity_name: 'Clinic A',
              address: 'Addr 1',
            },
            startTime: '09:00',
            endTime: '17:00',
          },
          {
            day: Days.TUESDAY,
            location: {
              type: WorkigEntity.CLINIC,
              entity_name: 'Clinic A',
              address: 'Addr 1',
            },
            startTime: '09:00',
            endTime: '17:00',
          },
        ],
        inspectionDuration: 30,
        inspectionPrice: 5000,
        doctorInfo: { fullName: 'Dr. Ali' },
      },
      progress: jest.fn().mockResolvedValue(undefined),
      log: jest.fn(),
    } as any;

    it('acquires a per-day lock for every unique working-hours day', async () => {
      mockCacheService.acquireLock.mockResolvedValue(true);
      mockSlotModel.insertMany.mockResolvedValue([]);

      await processor.handleSlotGeneration({ ...baseJob });

      expect(mockCacheService.acquireLock).toHaveBeenCalledWith(
        `lock:working_hours_create:${doctorId}:${Days.MONDAY}`,
        300,
      );
      expect(mockCacheService.acquireLock).toHaveBeenCalledWith(
        `lock:working_hours_create:${doctorId}:${Days.TUESDAY}`,
        300,
      );
      // slots were inserted — job ran normally
      expect(mockSlotModel.insertMany).toHaveBeenCalled();
    });

    it('skips the entire job without inserting when every day-lock is already held', async () => {
      mockCacheService.acquireLock.mockResolvedValue(false);
      mockSlotModel.insertMany.mockResolvedValue([]);
      const warnSpy = jest
        .spyOn((processor as any).logger, 'warn')
        .mockImplementation(() => {});

      await processor.handleSlotGeneration({ ...baseJob });

      expect(mockSlotModel.insertMany).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('lock '),
      );
      warnSpy.mockRestore();
    });

    it('treats Redis failures as locked (fail closed) and skips safely', async () => {
      // Real CacheService.acquireLock catches Redis errors and returns false.
      // Here we simulate that contract from the processor's perspective.
      mockCacheService.acquireLock.mockResolvedValue(false);
      mockSlotModel.insertMany.mockResolvedValue([]);

      await expect(
        processor.handleSlotGeneration({ ...baseJob }),
      ).resolves.toBeUndefined();

      expect(mockSlotModel.insertMany).not.toHaveBeenCalled();
    });
  });
});
