import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken, InjectConnection } from '@nestjs/mongoose';
import { getConnectionToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import {
  WorkingHoursUpdateProcessorV2,
  WorkingHoursUpdateJobData,
} from './update-working-hours.processor';
import { AppointmentSlot } from '@app/common/database/schemas/slot.schema';
import { Booking } from '@app/common/database/schemas/booking.schema';
import { KafkaService } from '@app/common/kafka/kafka.service';
import { CacheService } from '@app/common/cache/cache.service';
import { Days, SlotStatus } from '@app/common/database/schemas/common.enums';

jest.mock('@app/common/utils/cache-invalidation.util', () => ({
  invalidateBookingCaches: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@app/common/utils/get-syria-date', () => ({
  formatDate: jest.fn().mockReturnValue('2025-01-01'),
}));

describe('WorkingHoursUpdateProcessorV2', () => {
  let processor: WorkingHoursUpdateProcessorV2;

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

  const mockSlot = {
    _id: new Types.ObjectId(),
    status: SlotStatus.AVAILABLE,
    save: jest.fn().mockResolvedValue(undefined),
    'location.type': 'PRIVATE',
    'location.entity_name': 'Clinic',
    'location.address': 'Damascus',
  };

  const mockSlotModel = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn().mockResolvedValue({}),
    insertMany: jest.fn().mockResolvedValue([]),
    deleteMany: jest.fn().mockResolvedValue({ deletedCount: 0 }),
  };

  const mockBookingModel = {
    findOne: jest.fn(),
    updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
  };

  const mockKafkaService = {
    emit: jest.fn().mockResolvedValue(undefined),
  };

  const mockCacheService = {
    invalidatePattern: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
    invalidate: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockSession.startTransaction.mockClear();
    mockSession.commitTransaction.mockResolvedValue(undefined);
    mockSession.abortTransaction.mockResolvedValue(undefined);
    mockSession.endSession.mockResolvedValue(undefined);
    mockConnection.startSession.mockResolvedValue(mockSession);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkingHoursUpdateProcessorV2,
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

    processor = module.get<WorkingHoursUpdateProcessorV2>(
      WorkingHoursUpdateProcessorV2,
    );
  });

  it('should be defined', () => {
    expect(processor).toBeDefined();
  });

  describe('processWorkingHoursUpdate()', () => {
    const jobData: WorkingHoursUpdateJobData = {
      doctorId,
      oldWorkingHours: [
        {
          day: Days.MONDAY,
          location: {
            type: 'PRIVATE' as any,
            entity_name: 'Old Clinic',
            address: 'Old Address',
          },
          startTime: '08:00',
          endTime: '12:00',
        },
      ],
      newWorkingHours: [
        {
          day: Days.MONDAY,
          location: {
            type: 'PRIVATE' as any,
            entity_name: 'New Clinic',
            address: 'New Address',
          },
          startTime: '09:00',
          endTime: '13:00',
        },
      ],
      inspectionDuration: 30,
      inspectionPrice: 5000,
      version: 2,
      updatedDays: [Days.MONDAY],
    };

    it('processes working hours update without errors when no slots found', async () => {
      mockSlotModel.find.mockReturnValue({
        session: jest.fn().mockResolvedValue([]),
      });
      // generateNewSlotsForDate uses findOne to check existing slot before creating
      mockSlotModel.findOne.mockReturnValue({
        session: jest.fn().mockResolvedValue(null),
      });
      mockSlotModel.create.mockResolvedValue({});

      const mockJob = { data: jobData } as any;

      await expect(
        processor.processWorkingHoursUpdate(mockJob),
      ).resolves.not.toThrow();

      expect(mockConnection.startSession).toHaveBeenCalled();
      expect(mockSession.startTransaction).toHaveBeenCalled();
      expect(mockSession.commitTransaction).toHaveBeenCalled();
    });

    it('invalidates AVAILABLE slots that no longer fit new working hours', async () => {
      // Slot is at 07:00-07:30 which is OUTSIDE the new 09:00-13:00 range
      const availableSlot = {
        _id: new Types.ObjectId(),
        status: SlotStatus.AVAILABLE,
        startTime: '07:00',
        endTime: '07:30',
        location: {
          type: 'PRIVATE' as any,
          entity_name: 'Old Clinic',
          address: 'Old Address',
        },
        save: jest.fn().mockResolvedValue(undefined),
      };

      mockSlotModel.find.mockReturnValue({
        session: jest.fn().mockResolvedValue([availableSlot]),
      });

      // generateNewSlotsForDate calls findOne to check for existing slots
      mockSlotModel.findOne.mockReturnValue({
        session: jest.fn().mockResolvedValue(null),
      });

      const mockJob = { data: jobData } as any;
      await processor.processWorkingHoursUpdate(mockJob);

      // slot.save should have been called to mark it INVALIDATED
      expect(availableSlot.save).toHaveBeenCalled();
    });

    it('aborts transaction on error', async () => {
      mockSlotModel.find.mockReturnValue({
        session: jest.fn().mockRejectedValue(new Error('DB error')),
      });

      const mockJob = { data: jobData } as any;

      await expect(
        processor.processWorkingHoursUpdate(mockJob),
      ).rejects.toThrow('DB error');

      expect(mockSession.abortTransaction).toHaveBeenCalled();
    });
  });
});
