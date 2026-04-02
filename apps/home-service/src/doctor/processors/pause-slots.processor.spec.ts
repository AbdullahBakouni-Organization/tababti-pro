import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { PauseSlotsProcessor } from './Pause slots.processor';
import { Booking } from '@app/common/database/schemas/booking.schema';
import { AppointmentSlot } from '@app/common/database/schemas/slot.schema';
import { KafkaService } from '@app/common/kafka/kafka.service';
import { CacheService } from '@app/common/cache/cache.service';

jest.mock('@app/common/utils/cache-invalidation.util', () => ({
  invalidateBookingCaches: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@app/common/utils/get-syria-date', () => ({
  formatDate: jest.fn().mockReturnValue('2025-01-01'),
}));

describe('PauseSlotsProcessor', () => {
  let processor: PauseSlotsProcessor;

  const doctorId = new Types.ObjectId().toString();
  const slotId1 = new Types.ObjectId().toString();
  const bookingId1 = new Types.ObjectId().toString();

  const mockBookingModel = {
    find: jest.fn(),
    updateMany: jest.fn().mockResolvedValue({ modifiedCount: 0 }),
  };

  const mockSlotModel = {
    updateMany: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
  };

  const mockKafkaService = {
    emit: jest.fn().mockResolvedValue(undefined),
  };

  const mockCacheService = {
    invalidatePattern: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PauseSlotsProcessor,
        { provide: getModelToken(Booking.name), useValue: mockBookingModel },
        {
          provide: getModelToken(AppointmentSlot.name),
          useValue: mockSlotModel,
        },
        { provide: KafkaService, useValue: mockKafkaService },
        { provide: CacheService, useValue: mockCacheService },
      ],
    }).compile();

    processor = module.get<PauseSlotsProcessor>(PauseSlotsProcessor);
  });

  it('should be defined', () => {
    expect(processor).toBeDefined();
  });

  describe('handlePauseSlots()', () => {
    const baseJobData = {
      doctorId,
      slotIds: [slotId1],
      reason: 'Doctor on vacation',
      pauseDate: new Date().toISOString(),
      affectedBookingIds: [],
      doctorInfo: {
        fullName: 'Dr. Ali Ahmad',
        fcmToken: 'token-xyz',
      },
    };

    it('pauses slots with no affected bookings', async () => {
      const mockJob = { data: baseJobData } as any;

      await expect(processor.handlePauseSlots(mockJob)).resolves.not.toThrow();

      expect(mockSlotModel.updateMany).toHaveBeenCalled();
      expect(mockBookingModel.find).not.toHaveBeenCalled();
    });

    it('cancels bookings and pauses slots when affectedBookingIds provided', async () => {
      const patientId = new Types.ObjectId();
      const mockBooking = {
        _id: new Types.ObjectId(bookingId1),
        patientId: {
          _id: patientId,
          fcmToken: 'patient-token',
          username: 'Ali',
        },
        slotId: { _id: new Types.ObjectId(slotId1) },
        bookingDate: new Date(),
        bookingTime: '10:00',
      };

      mockBookingModel.find.mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([mockBooking]),
      });

      const jobData = {
        ...baseJobData,
        affectedBookingIds: [bookingId1],
      };

      const mockJob = { data: jobData } as any;
      await expect(processor.handlePauseSlots(mockJob)).resolves.not.toThrow();

      expect(mockBookingModel.updateMany).toHaveBeenCalled();
      expect(mockSlotModel.updateMany).toHaveBeenCalled();
    });

    it('throws and propagates error on failure', async () => {
      mockSlotModel.updateMany.mockRejectedValue(new Error('DB error'));

      const mockJob = { data: baseJobData } as any;
      await expect(processor.handlePauseSlots(mockJob)).rejects.toThrow(
        'DB error',
      );
    });
  });
});
