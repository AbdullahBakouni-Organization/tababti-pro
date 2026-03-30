import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { HolidayBlockProcessor } from './holidayblock.processor';
import { Booking } from '@app/common/database/schemas/booking.schema';
import { AppointmentSlot } from '@app/common/database/schemas/slot.schema';
import { KafkaService } from '@app/common/kafka/kafka.service';
import { CacheService } from '@app/common/cache/cache.service';

describe('HolidayBlockProcessor', () => {
  let processor: HolidayBlockProcessor;

  const mockSession = {
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    abortTransaction: jest.fn(),
    endSession: jest.fn(),
  };

  const mockBookingModel = {
    find: jest.fn(),
    updateMany: jest.fn(),
    db: { startSession: jest.fn().mockResolvedValue(mockSession) },
  };

  const mockSlotModel = {
    updateMany: jest.fn(),
  };

  const mockKafkaService = {
    emit: jest.fn(),
    send: jest.fn(),
  };

  const mockCacheService = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    invalidate: jest.fn(),
    invalidatePattern: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HolidayBlockProcessor,
        { provide: getModelToken(Booking.name), useValue: mockBookingModel },
        {
          provide: getModelToken(AppointmentSlot.name),
          useValue: mockSlotModel,
        },
        { provide: KafkaService, useValue: mockKafkaService },
        { provide: CacheService, useValue: mockCacheService },
      ],
    }).compile();

    processor = module.get<HolidayBlockProcessor>(HolidayBlockProcessor);
  });

  it('should be defined', () => {
    expect(processor).toBeDefined();
  });

  describe('handleHolidayBlock()', () => {
    const doctorId = new Types.ObjectId().toString();

    const mockJob = {
      id: 'job-1',
      data: {
        doctorId,
        doctorName: 'Dr. Ali',
        reason: 'Holiday',
        affectedBookingIds: [],
        affectedSlotIds: [],
      },
      progress: jest.fn().mockResolvedValue(undefined),
      log: jest.fn(),
    };

    it('handles holiday block with no affected bookings', async () => {
      mockBookingModel.find.mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        session: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([]),
      });
      mockBookingModel.updateMany.mockResolvedValue({ modifiedCount: 0 });
      mockSlotModel.updateMany.mockResolvedValue({ modifiedCount: 0 });

      await expect(
        processor.handleHolidayBlock(mockJob as any),
      ).resolves.toBeUndefined();
      expect(mockSession.commitTransaction).toHaveBeenCalled();
    });
  });
});
