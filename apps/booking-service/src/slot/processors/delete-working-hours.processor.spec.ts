import { Test, TestingModule } from '@nestjs/testing';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { WorkingHoursDeleteProcessor } from './delete-working-hours.processor';
import { AppointmentSlot } from '@app/common/database/schemas/slot.schema';
import { Booking } from '@app/common/database/schemas/booking.schema';
import { KafkaService } from '@app/common/kafka/kafka.service';
import { CacheService } from '@app/common/cache/cache.service';
import {
  Days,
  SlotStatus,
  WorkigEntity,
} from '@app/common/database/schemas/common.enums';

jest.mock('@app/common/utils/cache-invalidation.util', () => ({
  invalidateBookingCaches: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@app/common/utils/get-syria-date', () => ({
  formatDate: jest.fn().mockReturnValue('2025-01-01'),
  formatArabicDate: jest.fn().mockReturnValue('الاثنين 1 يناير 2025'),
}));

describe('WorkingHoursDeleteProcessor', () => {
  let processor: WorkingHoursDeleteProcessor;

  const doctorId = new Types.ObjectId().toString();

  const mockSession = {
    startTransaction: jest.fn(),
    commitTransaction: jest.fn().mockResolvedValue(undefined),
    abortTransaction: jest.fn().mockResolvedValue(undefined),
    endSession: jest.fn().mockResolvedValue(undefined),
  };

  const mockConnection = {
    startSession: jest.fn().mockResolvedValue(mockSession),
  };

  const mockSlotModel = {
    find: jest.fn(),
    findOne: jest.fn(),
  };

  const mockBookingModel = {
    findOne: jest.fn(),
    updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
  };

  const mockKafkaService = {
    emit: jest.fn().mockResolvedValue(undefined),
  };

  const mockCacheService = {
    acquireLock: jest.fn().mockResolvedValue(true),
    invalidate: jest.fn().mockResolvedValue(undefined),
    invalidatePattern: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
  };

  const jobData = {
    doctorId,
    deletedWorkingHour: {
      day: Days.MONDAY,
      location: {
        type: WorkigEntity.CLINIC,
        entity_name: 'Clinic A',
        address: 'Damascus',
      },
      startTime: '08:00',
      endTime: '12:00',
    },
    version: 1,
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockSession.startTransaction.mockClear();
    mockSession.commitTransaction.mockResolvedValue(undefined);
    mockSession.abortTransaction.mockResolvedValue(undefined);
    mockSession.endSession.mockResolvedValue(undefined);
    mockConnection.startSession.mockResolvedValue(mockSession);
    mockCacheService.acquireLock.mockResolvedValue(true);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkingHoursDeleteProcessor,
        { provide: getModelToken(AppointmentSlot.name), useValue: mockSlotModel },
        { provide: getModelToken(Booking.name), useValue: mockBookingModel },
        { provide: getConnectionToken(), useValue: mockConnection },
        { provide: KafkaService, useValue: mockKafkaService },
        { provide: CacheService, useValue: mockCacheService },
      ],
    }).compile();

    processor = module.get<WorkingHoursDeleteProcessor>(
      WorkingHoursDeleteProcessor,
    );
  });

  it('should be defined', () => {
    expect(processor).toBeDefined();
  });

  // ─── Main flow ────────────────────────────────────────────────────────────

  describe('processWorkingHoursDelete()', () => {
    it('processes empty result without throwing and commits the transaction', async () => {
      mockSlotModel.find.mockReturnValue({
        session: jest.fn().mockResolvedValue([]),
      });

      const mockJob = { data: jobData } as any;
      await expect(
        processor.processWorkingHoursDelete(mockJob),
      ).resolves.not.toThrow();

      expect(mockConnection.startSession).toHaveBeenCalled();
      expect(mockSession.startTransaction).toHaveBeenCalled();
      expect(mockSession.commitTransaction).toHaveBeenCalled();
    });

    it('invalidates slots whose time window falls inside the deleted entry', async () => {
      // 08:00–08:30 is inside 08:00–12:00, should be invalidated
      const slotInRange = {
        _id: new Types.ObjectId(),
        status: SlotStatus.AVAILABLE,
        startTime: '08:00',
        endTime: '08:30',
        location: jobData.deletedWorkingHour.location,
        save: jest.fn().mockResolvedValue(undefined),
      };

      // 07:30–08:00 is outside 08:00–12:00, must be skipped
      const slotOutOfRange = {
        _id: new Types.ObjectId(),
        status: SlotStatus.AVAILABLE,
        startTime: '07:30',
        endTime: '08:00',
        location: jobData.deletedWorkingHour.location,
        save: jest.fn().mockResolvedValue(undefined),
      };

      mockSlotModel.find.mockReturnValue({
        session: jest.fn().mockResolvedValue([slotInRange, slotOutOfRange]),
      });

      const mockJob = { data: jobData } as any;
      await processor.processWorkingHoursDelete(mockJob);

      expect(slotInRange.save).toHaveBeenCalled();
      expect(slotInRange.status).toBe(SlotStatus.INVALIDATED);
      expect(slotOutOfRange.save).not.toHaveBeenCalled();
    });

    it('uses a SINGLE bulk find covering the 48-week window (no per-date loop)', async () => {
      mockSlotModel.find.mockReturnValue({
        session: jest.fn().mockResolvedValue([]),
      });

      const mockJob = { data: jobData } as any;
      await processor.processWorkingHoursDelete(mockJob);

      // Exactly one find() call on the slot model — proves the per-date loop
      // is gone. The filter must include both dayOfWeek and a date range.
      expect(mockSlotModel.find).toHaveBeenCalledTimes(1);
      const filter = (mockSlotModel.find as jest.Mock).mock.calls[0][0];
      expect(filter.dayOfWeek).toBe(Days.MONDAY);
      expect(filter.date.$gte).toBeInstanceOf(Date);
      expect(filter.date.$lte).toBeInstanceOf(Date);
    });

    it('aborts the transaction when the slot query throws', async () => {
      mockSlotModel.find.mockReturnValue({
        session: jest.fn().mockRejectedValue(new Error('DB error')),
      });

      const mockJob = { data: jobData } as any;
      await expect(
        processor.processWorkingHoursDelete(mockJob),
      ).rejects.toThrow('DB error');

      expect(mockSession.abortTransaction).toHaveBeenCalled();
    });
  });

  // ─── Idempotency Lock ─────────────────────────────────────────────────────

  describe('Redis idempotency lock', () => {
    it('acquires the per-day lock with the documented key + 300s TTL', async () => {
      mockSlotModel.find.mockReturnValue({
        session: jest.fn().mockResolvedValue([]),
      });

      await processor.processWorkingHoursDelete({ data: jobData } as any);

      expect(mockCacheService.acquireLock).toHaveBeenCalledWith(
        `lock:working_hours_delete:${doctorId}:${Days.MONDAY}`,
        300,
      );
    });

    it('skips the job without starting a transaction when the lock is already held', async () => {
      mockCacheService.acquireLock.mockResolvedValue(false);
      const warnSpy = jest
        .spyOn((processor as any).logger, 'warn')
        .mockImplementation(() => {});

      await processor.processWorkingHoursDelete({ data: jobData } as any);

      expect(mockConnection.startSession).not.toHaveBeenCalled();
      expect(mockSlotModel.find).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('lock '),
      );
      warnSpy.mockRestore();
    });

    it('treats Redis failures as locked (fail closed) and skips safely', async () => {
      // Real CacheService.acquireLock swallows Redis errors and returns false.
      mockCacheService.acquireLock.mockResolvedValue(false);

      await expect(
        processor.processWorkingHoursDelete({ data: jobData } as any),
      ).resolves.toBeUndefined();

      expect(mockConnection.startSession).not.toHaveBeenCalled();
    });
  });
});
