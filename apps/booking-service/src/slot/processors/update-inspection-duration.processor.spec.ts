import { Test, TestingModule } from '@nestjs/testing';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { InspectionDurationUpdateProcessor } from './update-inspection-duration.processor';
import { AppointmentSlot } from '@app/common/database/schemas/slot.schema';
import { Booking } from '@app/common/database/schemas/booking.schema';
import { KafkaService } from '@app/common/kafka/kafka.service';
import { CacheService } from '@app/common/cache/cache.service';
import { Days, WorkigEntity } from '@app/common/database/schemas/common.enums';

jest.mock('@app/common/utils/cache-invalidation.util', () => ({
  invalidateBookingCaches: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@app/common/utils/get-syria-date', () => ({
  formatDate: jest.fn().mockReturnValue('2025-01-01'),
  formatArabicDate: jest.fn().mockReturnValue('الاثنين 1 يناير 2025'),
  getSyriaDate: jest.fn().mockReturnValue(new Date('2025-01-01T00:00:00Z')),
}));

describe('InspectionDurationUpdateProcessor', () => {
  let processor: InspectionDurationUpdateProcessor;

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
    updateMany: jest.fn().mockResolvedValue({ modifiedCount: 0 }),
    deleteMany: jest.fn().mockResolvedValue({ deletedCount: 0 }),
    insertMany: jest.fn().mockResolvedValue([]),
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
    oldInspectionDuration: 30,
    newInspectionDuration: 20,
    inspectionPrice: 5000,
    workingHours: [
      {
        day: Days.MONDAY,
        location: {
          type: WorkigEntity.CLINIC,
          entity_name: 'Clinic A',
          address: 'Damascus',
        },
        startTime: '09:00',
        endTime: '13:00',
      },
    ],
    doctorInfo: { fullName: 'Dr. Ali' },
    version: 2,
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockSession.startTransaction.mockClear();
    mockSession.commitTransaction.mockResolvedValue(undefined);
    mockSession.abortTransaction.mockResolvedValue(undefined);
    mockSession.endSession.mockResolvedValue(undefined);
    mockConnection.startSession.mockResolvedValue(mockSession);
    mockCacheService.acquireLock.mockResolvedValue(true);

    // Default: both the in-transaction `find` and the post-transaction
    // `find().select().lean()` chain return empty results.
    mockSlotModel.find.mockImplementation(() => ({
      session: jest.fn().mockResolvedValue([]),
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([]),
        }),
      }),
    }));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InspectionDurationUpdateProcessor,
        {
          provide: getModelToken(AppointmentSlot.name),
          useValue: mockSlotModel,
        },
        { provide: getModelToken(Booking.name), useValue: mockBookingModel },
        { provide: getConnectionToken(), useValue: mockConnection },
        { provide: KafkaService, useValue: mockKafkaService },
        { provide: CacheService, useValue: mockCacheService },
      ],
    }).compile();

    processor = module.get<InspectionDurationUpdateProcessor>(
      InspectionDurationUpdateProcessor,
    );
  });

  it('should be defined', () => {
    expect(processor).toBeDefined();
  });

  describe('process()', () => {
    it('runs normally when lock is acquired and commits the transaction', async () => {
      const mockJob = { data: jobData } as any;
      await expect(processor.process(mockJob)).resolves.not.toThrow();

      expect(mockConnection.startSession).toHaveBeenCalled();
      expect(mockSession.startTransaction).toHaveBeenCalled();
      expect(mockSession.commitTransaction).toHaveBeenCalled();
    });

    it('aborts the transaction when the in-transaction find throws', async () => {
      // Override: first find call throws; selected-lean stays as default.
      mockSlotModel.find.mockImplementationOnce(() => ({
        session: jest.fn().mockRejectedValue(new Error('DB error')),
      }));

      const mockJob = { data: jobData } as any;
      await expect(processor.process(mockJob)).rejects.toThrow('DB error');
      expect(mockSession.abortTransaction).toHaveBeenCalled();
    });
  });

  // ─── Idempotency Lock ─────────────────────────────────────────────────────

  describe('Redis idempotency lock', () => {
    it('acquires a doctor-wide lock with the documented key + 300s TTL', async () => {
      await processor.process({ data: jobData } as any);

      expect(mockCacheService.acquireLock).toHaveBeenCalledWith(
        `lock:inspection_duration_update:${doctorId}`,
        300,
      );
    });

    it('skips the job without starting a transaction when the lock is held', async () => {
      mockCacheService.acquireLock.mockResolvedValue(false);
      const warnSpy = jest
        .spyOn((processor as any).logger, 'warn')
        .mockImplementation(() => {});

      await processor.process({ data: jobData } as any);

      expect(mockConnection.startSession).not.toHaveBeenCalled();
      expect(mockSlotModel.find).not.toHaveBeenCalled();
      expect(mockSlotModel.deleteMany).not.toHaveBeenCalled();
      expect(mockSlotModel.insertMany).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('lock '));
      warnSpy.mockRestore();
    });

    it('treats Redis failures as locked (fail closed) and skips safely', async () => {
      // Real CacheService.acquireLock swallows Redis errors and returns false.
      mockCacheService.acquireLock.mockResolvedValue(false);

      await expect(
        processor.process({ data: jobData } as any),
      ).resolves.toBeUndefined();

      expect(mockConnection.startSession).not.toHaveBeenCalled();
    });

    it('releases the doctor-wide lock after a successful run', async () => {
      await processor.process({ data: jobData } as any);

      expect(mockCacheService.del).toHaveBeenCalledWith(
        `lock:inspection_duration_update:${doctorId}`,
      );
    });

    it('releases the doctor-wide lock even when the transaction aborts', async () => {
      mockSlotModel.find.mockImplementationOnce(() => ({
        session: jest.fn().mockRejectedValue(new Error('DB down')),
      }));

      await expect(
        processor.process({ data: jobData } as any),
      ).rejects.toThrow('DB down');

      expect(mockCacheService.del).toHaveBeenCalledWith(
        `lock:inspection_duration_update:${doctorId}`,
      );
    });
  });
});
