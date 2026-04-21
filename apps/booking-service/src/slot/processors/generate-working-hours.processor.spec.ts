import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { getQueueToken } from '@nestjs/bull';
import { Types } from 'mongoose';
import { SlotGenerationProcessor } from './generate-working-hours.processor';
import { AppointmentSlot } from '@app/common/database/schemas/slot.schema';
import { Days, WorkigEntity } from '@app/common/database/schemas/common.enums';
import { Doctor } from '@app/common/database/schemas/doctor.schema';
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
    acquireLock: jest.fn().mockResolvedValue('mock-token'),
    releaseLock: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
  };

  const mockQueue = {
    add: jest.fn().mockResolvedValue(undefined),
  };

  // Default Doctor mock — Phase 2 staleness check is fresh (job version >=
  // doctor.workingHoursVersion / job.timestamp >= doctor.updatedAt).
  const mockDoctorModel = {
    findById: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockCacheService.acquireLock.mockResolvedValue('mock-token');
    mockCacheService.releaseLock.mockResolvedValue(undefined);
    mockQueue.add.mockResolvedValue(undefined);
    mockDoctorModel.findById.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue({ updatedAt: new Date(0) }),
        }),
      }),
    });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SlotGenerationProcessor,
        {
          provide: getModelToken(AppointmentSlot.name),
          useValue: mockSlotModel,
        },
        { provide: getModelToken(Doctor.name), useValue: mockDoctorModel },
        { provide: CacheService, useValue: mockCacheService },
        {
          provide: getQueueToken('WORKING_HOURS_GENERATE'),
          useValue: mockQueue,
        },
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
      mockCacheService.acquireLock.mockResolvedValue('mock-token');
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
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('lock '));
      warnSpy.mockRestore();
    });

    it('skips the entire job when every day-lock is held by peer workers (false)', async () => {
      // `false` represents lock contention — a peer worker owns the key.
      mockCacheService.acquireLock.mockResolvedValue(false);
      mockSlotModel.insertMany.mockResolvedValue([]);

      await expect(
        processor.handleSlotGeneration({ ...baseJob }),
      ).resolves.toBeUndefined();

      expect(mockSlotModel.insertMany).not.toHaveBeenCalled();
    });

    it('throws so Bull retries when Redis is unavailable on the first acquire (null)', async () => {
      mockCacheService.acquireLock.mockResolvedValueOnce(null);
      mockSlotModel.insertMany.mockResolvedValue([]);

      await expect(
        processor.handleSlotGeneration({ ...baseJob }),
      ).rejects.toThrow(/Redis unavailable/);

      expect(mockSlotModel.insertMany).not.toHaveBeenCalled();
    });

    it('releases any already-acquired locks if Redis goes down mid-acquire (null on day 2)', async () => {
      // Day 1 acquires successfully, day 2 hits Redis outage.
      mockCacheService.acquireLock
        .mockResolvedValueOnce('tok-day1')
        .mockResolvedValueOnce(null);
      mockSlotModel.insertMany.mockResolvedValue([]);

      await expect(
        processor.handleSlotGeneration({ ...baseJob }),
      ).rejects.toThrow(/Redis unavailable/);

      // The first day-lock must have been released so a retry can re-acquire.
      expect(mockCacheService.releaseLock).toHaveBeenCalledWith(
        `lock:working_hours_create:${doctorId}:${Days.MONDAY}`,
        'tok-day1',
      );
    });

    it('releases every acquired day-lock once the job finishes', async () => {
      mockCacheService.acquireLock
        .mockResolvedValueOnce('tok-mon')
        .mockResolvedValueOnce('tok-tue');
      mockSlotModel.insertMany.mockResolvedValue([]);

      await processor.handleSlotGeneration({ ...baseJob });

      expect(mockCacheService.releaseLock).toHaveBeenCalledWith(
        `lock:working_hours_create:${doctorId}:${Days.MONDAY}`,
        'tok-mon',
      );
      expect(mockCacheService.releaseLock).toHaveBeenCalledWith(
        `lock:working_hours_create:${doctorId}:${Days.TUESDAY}`,
        'tok-tue',
      );
    });

    it('releases acquired day-locks even when the inner work throws', async () => {
      mockCacheService.acquireLock
        .mockResolvedValueOnce('tok-mon')
        .mockResolvedValueOnce('tok-tue');
      mockSlotModel.insertMany.mockRejectedValueOnce(new Error('boom'));

      await expect(
        processor.handleSlotGeneration({ ...baseJob }),
      ).rejects.toThrow('boom');

      expect(mockCacheService.releaseLock).toHaveBeenCalledWith(
        `lock:working_hours_create:${doctorId}:${Days.MONDAY}`,
        'tok-mon',
      );
      expect(mockCacheService.releaseLock).toHaveBeenCalledWith(
        `lock:working_hours_create:${doctorId}:${Days.TUESDAY}`,
        'tok-tue',
      );
    });
  });

  // ─── RC-3 (FIX 3): cross-op outer :ALL lock ─────────────────────────────
  describe('RC-3 cross-op :ALL outer lock', () => {
    const doctorId = new Types.ObjectId().toString();

    const baseJob = {
      id: 'job-rc3-1',
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

    it('acquires the doctor-wide :ALL lock AFTER all per-day locks', async () => {
      const acquireOrder: string[] = [];
      mockCacheService.acquireLock.mockImplementation((key: string) => {
        acquireOrder.push(key);
        return Promise.resolve('mock-token');
      });
      mockSlotModel.insertMany.mockResolvedValue([]);

      await processor.handleSlotGeneration({ ...baseJob });

      expect(acquireOrder).toEqual([
        `lock:working_hours_create:${doctorId}:${Days.MONDAY}`,
        `lock:working_hours_create:${doctorId}:${Days.TUESDAY}`,
        `lock:doctor:${doctorId}:ALL`,
      ]);
    });

    it('throws on :ALL contention, releases EVERY per-day lock, and skips inserts', async () => {
      // Day 1, Day 2 succeed with tokens; :ALL hits contention.
      mockCacheService.acquireLock
        .mockResolvedValueOnce('tok-mon')
        .mockResolvedValueOnce('tok-tue')
        .mockResolvedValueOnce(false);
      mockSlotModel.insertMany.mockResolvedValue([]);
      const warnSpy = jest
        .spyOn((processor as any).logger, 'warn')
        .mockImplementation(() => {});

      await expect(
        processor.handleSlotGeneration({ ...baseJob }),
      ).rejects.toThrow(/Cross-op lock .* held/);

      expect(mockCacheService.releaseLock).toHaveBeenCalledWith(
        `lock:working_hours_create:${doctorId}:${Days.MONDAY}`,
        'tok-mon',
      );
      expect(mockCacheService.releaseLock).toHaveBeenCalledWith(
        `lock:working_hours_create:${doctorId}:${Days.TUESDAY}`,
        'tok-tue',
      );
      expect(mockCacheService.releaseLock).not.toHaveBeenCalledWith(
        `lock:doctor:${doctorId}:ALL`,
        expect.anything(),
      );
      expect(mockSlotModel.insertMany).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Contended'));
      warnSpy.mockRestore();
    });

    it('throws on :ALL Redis-down, releases EVERY per-day lock', async () => {
      mockCacheService.acquireLock
        .mockResolvedValueOnce('tok-mon')
        .mockResolvedValueOnce('tok-tue')
        .mockResolvedValueOnce(null);
      mockSlotModel.insertMany.mockResolvedValue([]);

      await expect(
        processor.handleSlotGeneration({ ...baseJob }),
      ).rejects.toThrow(/Redis unavailable acquiring lock:doctor:.*:ALL/);

      expect(mockCacheService.releaseLock).toHaveBeenCalledWith(
        `lock:working_hours_create:${doctorId}:${Days.MONDAY}`,
        'tok-mon',
      );
      expect(mockCacheService.releaseLock).toHaveBeenCalledWith(
        `lock:working_hours_create:${doctorId}:${Days.TUESDAY}`,
        'tok-tue',
      );
    });

    it('releases :ALL BEFORE per-day locks in finally (reverse acquire order)', async () => {
      mockCacheService.acquireLock
        .mockResolvedValueOnce('tok-mon')
        .mockResolvedValueOnce('tok-tue')
        .mockResolvedValueOnce('tok-all');
      mockSlotModel.insertMany.mockResolvedValue([]);
      const releaseOrder: string[] = [];
      mockCacheService.releaseLock.mockImplementation((key: string) => {
        releaseOrder.push(key);
        return Promise.resolve(undefined);
      });

      await processor.handleSlotGeneration({ ...baseJob });

      expect(releaseOrder).toEqual([
        `lock:doctor:${doctorId}:ALL`,
        `lock:working_hours_create:${doctorId}:${Days.MONDAY}`,
        `lock:working_hours_create:${doctorId}:${Days.TUESDAY}`,
      ]);
    });
  });

  // ─── Phase 1 / Phase 2 split ────────────────────────────────────────────
  describe('Phase 1 / Phase 2 split', () => {
    const doctorId = new Types.ObjectId().toString();

    const baseJob = {
      id: 'job-phase-1',
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
    } as any;

    it('dispatches Phase 2 via selfQueue.add after a successful Phase 1', async () => {
      mockSlotModel.insertMany.mockResolvedValue([]);

      await processor.handleSlotGeneration({ ...baseJob });

      expect(mockQueue.add).toHaveBeenCalledWith(
        'PROCESS_WORKING_HOURS_GENERATE_PHASE2',
        baseJob.data,
      );
    });

    it('does not dispatch Phase 2 when Phase 1 throws', async () => {
      mockSlotModel.insertMany.mockRejectedValueOnce(new Error('boom'));

      await expect(
        processor.handleSlotGeneration({ ...baseJob }),
      ).rejects.toThrow('boom');

      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('does not throw when Phase 2 dispatch fails (Phase 1 result stands)', async () => {
      mockSlotModel.insertMany.mockResolvedValue([]);
      mockQueue.add.mockRejectedValueOnce(new Error('Bull/Redis down'));
      const errorSpy = jest
        .spyOn((processor as any).logger, 'error')
        .mockImplementation(() => {});

      await expect(
        processor.handleSlotGeneration({ ...baseJob }),
      ).resolves.toBeUndefined();

      // Flush the fire-and-forget dispatch's rejection handler.
      await new Promise((resolve) => setImmediate(resolve));

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to dispatch Phase 2'),
        expect.anything(),
      );
      errorSpy.mockRestore();
    });

    it('Phase 2 handler acquires the :backfill lock and inserts slots', async () => {
      mockSlotModel.insertMany.mockResolvedValue([]);

      await processor.handleSlotGenerationPhase2({ ...baseJob });

      expect(mockCacheService.acquireLock).toHaveBeenCalledWith(
        `lock:working_hours_create:${doctorId}:${Days.MONDAY}:backfill`,
        300,
      );
      expect(mockSlotModel.insertMany).toHaveBeenCalled();
    });

    it('Phase 2 handler releases :backfill locks after completion', async () => {
      mockSlotModel.insertMany.mockResolvedValue([]);

      await processor.handleSlotGenerationPhase2({ ...baseJob });

      expect(mockCacheService.releaseLock).toHaveBeenCalledWith(
        `lock:working_hours_create:${doctorId}:${Days.MONDAY}:backfill`,
        'mock-token',
      );
    });

    it('Phase 2 handler does not chain another Phase 2', async () => {
      mockSlotModel.insertMany.mockResolvedValue([]);

      await processor.handleSlotGenerationPhase2({ ...baseJob });

      expect(mockQueue.add).not.toHaveBeenCalled();
    });
  });

  // ─── RC-6 (FIX 6): Phase 2 staleness check ─────────────────────────────
  describe('RC-6 Phase 2 staleness check', () => {
    const doctorId = new Types.ObjectId().toString();
    // Pin job timestamp so we can deterministically compare doctor.updatedAt.
    const jobTimestamp = '2025-06-01T12:00:00.000Z';

    const baseJob = {
      id: 'job-rc6-1',
      data: {
        eventType: 'SLOTS_GENERATE' as const,
        timestamp: jobTimestamp,
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
    } as any;

    it('proceeds with Phase 2 when doctor.updatedAt <= job.timestamp', async () => {
      // Doctor was last touched BEFORE this job — no newer event in flight.
      mockDoctorModel.findById.mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockReturnValue({
            exec: jest
              .fn()
              .mockResolvedValue({ updatedAt: new Date(jobTimestamp) }),
          }),
        }),
      });
      mockSlotModel.insertMany.mockResolvedValue([]);

      await processor.handleSlotGenerationPhase2({ ...baseJob });

      expect(mockCacheService.acquireLock).toHaveBeenCalledWith(
        `lock:working_hours_create:${doctorId}:${Days.MONDAY}:backfill`,
        300,
      );
      expect(mockSlotModel.insertMany).toHaveBeenCalled();
    });

    it('skips Phase 2 when doctor.updatedAt has advanced past job.timestamp', async () => {
      // A newer working-hours event (or any doctor write) bumped updatedAt
      // after this job was queued — its own Phase 2 will dispatch fresh slots.
      mockDoctorModel.findById.mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue({
              updatedAt: new Date(
                new Date(jobTimestamp).getTime() + 60_000,
              ),
            }),
          }),
        }),
      });

      const warnSpy = jest
        .spyOn((processor as any).logger, 'warn')
        .mockImplementation(() => {});

      await processor.handleSlotGenerationPhase2({ ...baseJob });

      // Skipped — no lock taken, no inserts.
      expect(mockCacheService.acquireLock).not.toHaveBeenCalled();
      expect(mockSlotModel.insertMany).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('stale'));
      warnSpy.mockRestore();
    });

    it('skips Phase 2 cleanly when the doctor record is gone', async () => {
      mockDoctorModel.findById.mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue(null),
          }),
        }),
      });

      const warnSpy = jest
        .spyOn((processor as any).logger, 'warn')
        .mockImplementation(() => {});

      await processor.handleSlotGenerationPhase2({ ...baseJob });

      expect(mockCacheService.acquireLock).not.toHaveBeenCalled();
      expect(mockSlotModel.insertMany).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('not found'));
      warnSpy.mockRestore();
    });

    it('Phase 1 handler is NOT staleness-checked (always runs)', async () => {
      // Doctor.updatedAt way in the future — Phase 1 still runs because it
      // represents the user's most recent intent at the moment it executes.
      mockDoctorModel.findById.mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue({
              updatedAt: new Date(
                new Date(jobTimestamp).getTime() + 86_400_000,
              ),
            }),
          }),
        }),
      });
      mockSlotModel.insertMany.mockResolvedValue([]);

      await processor.handleSlotGeneration({ ...baseJob });

      expect(mockSlotModel.insertMany).toHaveBeenCalled();
      expect(mockDoctorModel.findById).not.toHaveBeenCalled();
    });
  });
});
