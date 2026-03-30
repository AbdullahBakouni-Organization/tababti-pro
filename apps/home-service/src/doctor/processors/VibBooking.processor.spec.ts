import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { VIPBookingProcessor } from './VibBooking.processor';
import { Booking } from '@app/common/database/schemas/booking.schema';
import { AppointmentSlot } from '@app/common/database/schemas/slot.schema';
import { User } from '@app/common/database/schemas/user.schema';
import { KafkaService } from '@app/common/kafka/kafka.service';
import { CacheService } from '@app/common/cache/cache.service';

describe('VIPBookingProcessor', () => {
  let processor: VIPBookingProcessor;

  const mockSession = {
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    abortTransaction: jest.fn(),
    endSession: jest.fn(),
  };

  const mockBookingModel = {
    findById: jest.fn(),
    findByIdAndUpdate: jest.fn(),
    create: jest.fn(),
    updateOne: jest.fn(),
    db: { startSession: jest.fn().mockResolvedValue(mockSession) },
  };

  const mockSlotModel = {
    findByIdAndUpdate: jest.fn(),
    findById: jest.fn(),
  };

  const mockUserModel = {
    findById: jest.fn(),
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
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VIPBookingProcessor,
        { provide: getModelToken(Booking.name), useValue: mockBookingModel },
        { provide: getModelToken(AppointmentSlot.name), useValue: mockSlotModel },
        { provide: getModelToken(User.name), useValue: mockUserModel },
        { provide: KafkaService, useValue: mockKafkaService },
        { provide: CacheService, useValue: mockCacheService },
      ],
    }).compile();

    processor = module.get<VIPBookingProcessor>(VIPBookingProcessor);
  });

  it('should be defined', () => {
    expect(processor).toBeDefined();
  });

  describe('handleVIPBooking()', () => {
    const mockJob = {
      id: 'job-1',
      data: {
        doctorId: new Types.ObjectId().toString(),
        doctorName: 'Dr. Ali',
        slotId: new Types.ObjectId().toString(),
        vipPatientId: new Types.ObjectId().toString(),
        existingBookingId: null,
        reason: 'VIP patient',
        note: 'Note',
      },
      progress: jest.fn().mockResolvedValue(undefined),
      log: jest.fn(),
    };

    it('handles VIP booking without existing booking', async () => {
      const mockSlot = {
        _id: new Types.ObjectId(),
        doctorId: new Types.ObjectId(),
        slotDate: new Date(),
        startTime: '09:00',
        status: 'available',
        location: { type: 'clinic', entity_name: 'Clinic A', address: 'Addr' },
        save: jest.fn().mockResolvedValue(undefined),
      };

      mockSlotModel.findById.mockReturnValue({
        session: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(mockSlot),
      });

      mockSlotModel.findByIdAndUpdate.mockReturnValue({
        session: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(mockSlot),
      });

      const mockUser = { _id: new Types.ObjectId(), username: 'patient1' };
      mockUserModel.findById.mockReturnValue({
        session: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(mockUser),
      });

      const mockBooking = { _id: new Types.ObjectId(), status: 'pending' };
      mockBookingModel.create.mockResolvedValue([mockBooking]);

      await expect(processor.handleVIPBooking(mockJob as any)).resolves.toBeUndefined();
    });
  });
});
