import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bull';
import { SlotKafkaController } from './slot-kafka.controller';
import { SlotGenerationService } from './slot.service';
import { CacheService } from '@app/common/cache/cache.service';

describe('SlotKafkaController', () => {
  let controller: SlotKafkaController;

  const mockSlotGenerationService = {
    getAvailableSlots: jest.fn().mockResolvedValue([]),
  };

  const mockWorkingHoursQueue = {
    add: jest.fn().mockResolvedValue({ id: 'job-1' }),
  };

  const mockWorkingHoursQueueV1 = {
    add: jest.fn().mockResolvedValue({ id: 'job-2' }),
  };

  const mockWorkingHoursDeleteQueue = {
    add: jest.fn().mockResolvedValue({ id: 'job-3' }),
  };

  const mockInspectionDurationQueue = {
    add: jest.fn().mockResolvedValue({ id: 'job-4' }),
  };

  const mockCacheService = {
    acquireLock: jest.fn(),
    releaseLock: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    // Default: every event-lock acquired cleanly with a fresh fencing token.
    mockCacheService.acquireLock.mockResolvedValue('event-tok');
    mockCacheService.releaseLock.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SlotKafkaController],
      providers: [
        { provide: SlotGenerationService, useValue: mockSlotGenerationService },
        {
          provide: getQueueToken('WORKING_HOURS_UPDATE'),
          useValue: mockWorkingHoursQueue,
        },
        {
          provide: getQueueToken('WORKING_HOURS_GENERATE'),
          useValue: mockWorkingHoursQueueV1,
        },
        {
          provide: getQueueToken('WORKING_HOURS_DELETE'),
          useValue: mockWorkingHoursDeleteQueue,
        },
        {
          provide: getQueueToken('INSPECTION_DURATION_UPDATE'),
          useValue: mockInspectionDurationQueue,
        },
        { provide: CacheService, useValue: mockCacheService },
      ],
    }).compile();

    controller = module.get<SlotKafkaController>(SlotKafkaController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('handleSlotsRefreshed()', () => {
    it('calls getAvailableSlots with doctorId', async () => {
      const event = { data: { doctorId: 'doc-1', location: 'clinic' } };
      await controller.handleSlotsRefreshed(event as any);
      expect(mockSlotGenerationService.getAvailableSlots).toHaveBeenCalledWith({
        doctorId: 'doc-1',
      });
    });

    it('does not throw when getAvailableSlots fails', async () => {
      mockSlotGenerationService.getAvailableSlots.mockRejectedValue(
        new Error('Service down'),
      );
      const event = { data: { doctorId: 'doc-1', location: 'clinic' } };
      await expect(
        controller.handleSlotsRefreshed(event as any),
      ).resolves.toBeUndefined();
    });
  });

  describe('handleWorkingHoursUpdated()', () => {
    it('adds job to WORKING_HOURS_UPDATE queue', async () => {
      const event = {
        doctorId: 'doc-1',
        oldWorkingHours: [],
        newWorkingHours: [],
        updatedDays: ['MONDAY'],
        version: 1,
        inspectionDuration: 30,
        inspectionPrice: 5000,
      };
      await controller.handleWorkingHoursUpdated(event as any);
      expect(mockWorkingHoursQueue.add).toHaveBeenCalledWith(
        'PROCESS_WORKING_HOURS_UPDATE',
        expect.objectContaining({ doctorId: 'doc-1' }),
      );
    });
  });

  // ─── Event-level idempotency lock (Kafka layer) ─────────────────────────
  // Closes the duplicate-event window: frontend retries / double-clicks
  // produce identical Kafka events; without this lock each one queues its
  // own Bull job and runs sequentially, since processor-level locks release
  // before the next duplicate dequeues.

  describe('Event-lock: WORKING_HOURS_UPDATED', () => {
    const baseEvent = {
      doctorId: 'doc-1',
      oldWorkingHours: [],
      newWorkingHours: [],
      updatedDays: ['MONDAY'],
      version: 1,
      inspectionDuration: 30,
      inspectionPrice: 5000,
    };

    it('first event: acquires lock, enqueues job, releases lock', async () => {
      mockCacheService.acquireLock.mockResolvedValueOnce('tok-mon');

      await controller.handleWorkingHoursUpdated(baseEvent as any);

      expect(mockCacheService.acquireLock).toHaveBeenCalledWith(
        'lock:kafka_event:wh_update:doc-1:MONDAY',
        30,
      );
      expect(mockWorkingHoursQueue.add).toHaveBeenCalledTimes(1);
      expect(mockCacheService.releaseLock).toHaveBeenCalledWith(
        'lock:kafka_event:wh_update:doc-1:MONDAY',
        'tok-mon',
      );
    });

    it('duplicate event within 30s: lock held → job skipped, warning logged', async () => {
      mockCacheService.acquireLock.mockResolvedValueOnce(false);
      const warnSpy = jest
        .spyOn((controller as any).logger, 'warn')
        .mockImplementation(() => {});

      await controller.handleWorkingHoursUpdated(baseEvent as any);

      expect(mockWorkingHoursQueue.add).not.toHaveBeenCalled();
      expect(mockCacheService.releaseLock).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Duplicate Kafka event'),
      );
      warnSpy.mockRestore();
    });

    it('Redis down: null returned → throws so Kafka retries', async () => {
      mockCacheService.acquireLock.mockResolvedValueOnce(null);

      await expect(
        controller.handleWorkingHoursUpdated(baseEvent as any),
      ).rejects.toThrow('Redis unavailable');

      expect(mockWorkingHoursQueue.add).not.toHaveBeenCalled();
    });
  });

  describe('Event-lock: WORKING_HOURS_DELETED', () => {
    const baseEvent = {
      doctorId: 'doc-1',
      deletedWorkingHour: { day: 'SATURDAY' },
      version: 1,
    };

    it('first event: acquires lock, enqueues job, releases lock', async () => {
      mockCacheService.acquireLock.mockResolvedValueOnce('tok-sat');

      await controller.handleWorkingHoursDeleted(baseEvent as any);

      expect(mockCacheService.acquireLock).toHaveBeenCalledWith(
        'lock:kafka_event:wh_delete:doc-1:SATURDAY',
        30,
      );
      expect(mockWorkingHoursDeleteQueue.add).toHaveBeenCalledTimes(1);
      expect(mockCacheService.releaseLock).toHaveBeenCalledWith(
        'lock:kafka_event:wh_delete:doc-1:SATURDAY',
        'tok-sat',
      );
    });

    it('duplicate event within 30s: lock held → job skipped, warning logged', async () => {
      mockCacheService.acquireLock.mockResolvedValueOnce(false);
      const warnSpy = jest
        .spyOn((controller as any).logger, 'warn')
        .mockImplementation(() => {});

      await controller.handleWorkingHoursDeleted(baseEvent as any);

      expect(mockWorkingHoursDeleteQueue.add).not.toHaveBeenCalled();
      expect(mockCacheService.releaseLock).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Duplicate Kafka event'),
      );
      warnSpy.mockRestore();
    });

    it('Redis down: null returned → throws so Kafka retries', async () => {
      mockCacheService.acquireLock.mockResolvedValueOnce(null);

      await expect(
        controller.handleWorkingHoursDeleted(baseEvent as any),
      ).rejects.toThrow('Redis unavailable');

      expect(mockWorkingHoursDeleteQueue.add).not.toHaveBeenCalled();
    });
  });

  describe('Event-lock: SLOTS_GENERATE (working hours created)', () => {
    const baseEvent = {
      eventType: 'SLOTS_GENERATE' as const,
      timestamp: new Date().toISOString(),
      data: {
        doctorId: 'doc-1',
        WorkingHours: [
          { day: 'MONDAY', location: {}, startTime: '09:00', endTime: '17:00' },
          { day: 'TUESDAY', location: {}, startTime: '09:00', endTime: '17:00' },
        ],
        inspectionDuration: 30,
        inspectionPrice: 5000,
        doctorInfo: { fullName: 'Dr. Ali' },
      },
    };

    it('first event: acquires per-day locks, enqueues job, releases all locks', async () => {
      mockCacheService.acquireLock
        .mockResolvedValueOnce('tok-mon')
        .mockResolvedValueOnce('tok-tue');

      await controller.handleSlotGenerationEvent(baseEvent as any);

      expect(mockCacheService.acquireLock).toHaveBeenCalledWith(
        'lock:kafka_event:wh_create:doc-1:MONDAY',
        30,
      );
      expect(mockCacheService.acquireLock).toHaveBeenCalledWith(
        'lock:kafka_event:wh_create:doc-1:TUESDAY',
        30,
      );
      expect(mockWorkingHoursQueueV1.add).toHaveBeenCalledTimes(1);
      expect(mockCacheService.releaseLock).toHaveBeenCalledWith(
        'lock:kafka_event:wh_create:doc-1:MONDAY',
        'tok-mon',
      );
      expect(mockCacheService.releaseLock).toHaveBeenCalledWith(
        'lock:kafka_event:wh_create:doc-1:TUESDAY',
        'tok-tue',
      );
    });

    it('duplicate event within 30s (every day-lock held): job skipped, warning logged', async () => {
      mockCacheService.acquireLock
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(false);
      const warnSpy = jest
        .spyOn((controller as any).logger, 'warn')
        .mockImplementation(() => {});

      await controller.handleSlotGenerationEvent(baseEvent as any);

      expect(mockWorkingHoursQueueV1.add).not.toHaveBeenCalled();
      expect(mockCacheService.releaseLock).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Duplicate Kafka event'),
      );
      warnSpy.mockRestore();
    });

    it('Redis down: null returned → throws so Kafka retries (and releases any partial acquires)', async () => {
      mockCacheService.acquireLock
        .mockResolvedValueOnce('tok-mon')
        .mockResolvedValueOnce(null);

      await expect(
        controller.handleSlotGenerationEvent(baseEvent as any),
      ).rejects.toThrow('Redis unavailable');

      // Partial acquire on day 1 must be released so a Kafka retry can re-acquire.
      expect(mockCacheService.releaseLock).toHaveBeenCalledWith(
        'lock:kafka_event:wh_create:doc-1:MONDAY',
        'tok-mon',
      );
      expect(mockWorkingHoursQueueV1.add).not.toHaveBeenCalled();
    });
  });

  describe('Event-lock: INSPECTION_DURATION_CHANGED', () => {
    const baseEvent = {
      doctorId: 'doc-1',
      oldInspectionDuration: 30,
      newInspectionDuration: 45,
      inspectionPrice: 5000,
      workingHours: [],
      doctorInfo: { fullName: 'Dr. Ali' },
      version: 1,
    };

    it('first event: acquires doctor-wide lock, enqueues job, releases lock', async () => {
      mockCacheService.acquireLock.mockResolvedValueOnce('tok-insp');

      await controller.handleInspectionDurationChanged(baseEvent as any);

      expect(mockCacheService.acquireLock).toHaveBeenCalledWith(
        'lock:kafka_event:inspection:doc-1',
        30,
      );
      expect(mockInspectionDurationQueue.add).toHaveBeenCalledTimes(1);
      expect(mockCacheService.releaseLock).toHaveBeenCalledWith(
        'lock:kafka_event:inspection:doc-1',
        'tok-insp',
      );
    });

    it('duplicate event within 30s: lock held → job skipped, warning logged', async () => {
      mockCacheService.acquireLock.mockResolvedValueOnce(false);
      const warnSpy = jest
        .spyOn((controller as any).logger, 'warn')
        .mockImplementation(() => {});

      await controller.handleInspectionDurationChanged(baseEvent as any);

      expect(mockInspectionDurationQueue.add).not.toHaveBeenCalled();
      expect(mockCacheService.releaseLock).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Duplicate Kafka event'),
      );
      warnSpy.mockRestore();
    });

    it('Redis down: null returned → throws so Kafka retries', async () => {
      mockCacheService.acquireLock.mockResolvedValueOnce(null);

      await expect(
        controller.handleInspectionDurationChanged(baseEvent as any),
      ).rejects.toThrow('Redis unavailable');

      expect(mockInspectionDurationQueue.add).not.toHaveBeenCalled();
    });
  });
});
