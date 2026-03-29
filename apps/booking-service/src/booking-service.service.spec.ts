import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { BookingService } from './booking-service.service';
import { Booking } from '@app/common/database/schemas/booking.schema';
import { AppointmentSlot } from '@app/common/database/schemas/slot.schema';
import { User } from '@app/common/database/schemas/user.schema';
import { Doctor } from '@app/common/database/schemas/doctor.schema';
import { CacheService } from '@app/common/cache/cache.service';
import { BookingValidationService } from '@app/common/booking-validation';
import { createMockCacheService, createMockModel } from '@app/common/testing';
import {
  BookingStatus,
  SlotStatus,
} from '@app/common/database/schemas/common.enums';

// Mock the cache-invalidation utility
jest.mock('@app/common/utils/cache-invalidation.util', () => ({
  invalidateBookingCaches: jest.fn().mockResolvedValue(undefined),
}));

describe('BookingService', () => {
  let service: BookingService;
  let bookingModel: ReturnType<typeof createMockModel>;
  let slotModel: ReturnType<typeof createMockModel>;
  let userModel: ReturnType<typeof createMockModel>;
  let doctorModel: ReturnType<typeof createMockModel>;
  let cacheService: ReturnType<typeof createMockCacheService>;
  let bookingValidationService: { validateBooking: jest.Mock };

  const patientId = new Types.ObjectId().toString();
  const doctorId = new Types.ObjectId().toString();
  const slotId = new Types.ObjectId().toString();

  const mockSession = {
    startTransaction: jest.fn(),
    commitTransaction: jest.fn().mockResolvedValue(undefined),
    abortTransaction: jest.fn().mockResolvedValue(undefined),
    endSession: jest.fn().mockResolvedValue(undefined),
    inTransaction: jest.fn().mockReturnValue(true),
  };

  const mockSlot = {
    _id: new Types.ObjectId(slotId),
    date: new Date(Date.now() + 86400000),
    startTime: '09:00',
    endTime: '09:30',
    location: 'Clinic A',
    price: 2000,
    status: SlotStatus.AVAILABLE,
    doctorId: new Types.ObjectId(doctorId),
  };

  const mockPatient = { _id: new Types.ObjectId(patientId), username: 'Ali' };
  const mockDoctor = {
    _id: new Types.ObjectId(doctorId),
    inspectionPrice: 2500,
  };
  const mockBooking = {
    _id: new Types.ObjectId(),
    status: BookingStatus.PENDING,
  };

  beforeEach(async () => {
    bookingModel = createMockModel();
    slotModel = createMockModel();
    userModel = createMockModel();
    doctorModel = createMockModel();
    cacheService = createMockCacheService();
    bookingValidationService = {
      validateBooking: jest.fn().mockResolvedValue({ canBook: true }),
    };

    mockSession.commitTransaction.mockResolvedValue(undefined);
    mockSession.abortTransaction.mockResolvedValue(undefined);

    // Inject db.startSession into bookingModel
    (bookingModel as any).db = {
      startSession: jest.fn().mockResolvedValue(mockSession),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookingService,
        { provide: getModelToken(Booking.name), useValue: bookingModel },
        { provide: getModelToken(AppointmentSlot.name), useValue: slotModel },
        { provide: getModelToken(User.name), useValue: userModel },
        { provide: getModelToken(Doctor.name), useValue: doctorModel },
        { provide: CacheService, useValue: cacheService },
        {
          provide: BookingValidationService,
          useValue: bookingValidationService,
        },
      ],
    }).compile();

    service = module.get<BookingService>(BookingService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─── Happy path ───────────────────────────────────────────────────────────

  describe('createBooking() — success', () => {
    const dto = { doctorId, slotId, createdBy: 'patient', note: '' };

    beforeEach(() => {
      slotModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockSlot),
      });
      userModel.findById.mockReturnValue({
        session: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(mockPatient),
      });
      doctorModel.findById.mockReturnValue({
        session: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(mockDoctor),
      });
      slotModel.findOneAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockSlot),
      });
      bookingModel.findOne.mockReturnValue({
        session: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(null),
      });
      bookingModel.create.mockResolvedValue([mockBooking]);
    });

    it('creates booking and returns success response', async () => {
      const result = await service.createBooking(dto as any, patientId);

      expect(result.success).toBe(true);
      expect(bookingModel.create).toHaveBeenCalled();
      expect(mockSession.commitTransaction).toHaveBeenCalled();
    });

    it('calls BookingValidationService.validateBooking with correct args', async () => {
      await service.createBooking(dto as any, patientId);

      expect(bookingValidationService.validateBooking).toHaveBeenCalledWith(
        patientId,
        doctorId,
        mockSlot.date,
        slotId,
      );
    });

    it('creates booking with PENDING status', async () => {
      await service.createBooking(dto as any, patientId);

      expect(bookingModel.create).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ status: BookingStatus.PENDING }),
        ]),
        expect.any(Object),
      );
    });

    it('commits transaction on success', async () => {
      await service.createBooking(dto as any, patientId);
      expect(mockSession.commitTransaction).toHaveBeenCalled();
      expect(mockSession.abortTransaction).not.toHaveBeenCalled();
    });
  });

  // ─── Input validation ─────────────────────────────────────────────────────

  describe('createBooking() — input validation', () => {
    it('throws BadRequestException for invalid doctorId', async () => {
      await expect(
        service.createBooking({ doctorId: 'bad-id', slotId } as any, patientId),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for invalid slotId', async () => {
      await expect(
        service.createBooking({ doctorId, slotId: 'bad-id' } as any, patientId),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when slot does not exist', async () => {
      slotModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(
        service.createBooking({ doctorId, slotId } as any, patientId),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when booking validation fails', async () => {
      slotModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockSlot),
      });
      bookingValidationService.validateBooking.mockResolvedValue({
        canBook: false,
        reason: 'Already booked with this doctor',
      });

      await expect(
        service.createBooking({ doctorId, slotId } as any, patientId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when patient does not exist', async () => {
      slotModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockSlot),
      });
      userModel.findById.mockReturnValue({
        session: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(
        service.createBooking({ doctorId, slotId } as any, patientId),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when doctor does not exist', async () => {
      slotModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockSlot),
      });
      userModel.findById.mockReturnValue({
        session: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(mockPatient),
      });
      doctorModel.findById.mockReturnValue({
        session: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(
        service.createBooking({ doctorId, slotId } as any, patientId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── Transaction & race condition handling ────────────────────────────────

  describe('createBooking() — transactions & race conditions', () => {
    const dto = { doctorId, slotId } as any;

    it('aborts transaction and rethrows on any error', async () => {
      slotModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockSlot),
      });
      userModel.findById.mockReturnValue({
        session: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(mockPatient),
      });
      doctorModel.findById.mockReturnValue({
        session: jest.fn().mockReturnThis(),
        exec: jest.fn().mockRejectedValue(new Error('DB connection lost')),
      });

      await expect(service.createBooking(dto, patientId)).rejects.toThrow(
        'DB connection lost',
      );
      expect(mockSession.abortTransaction).toHaveBeenCalled();
    });

    it('throws ConflictException on duplicate booking (same time)', async () => {
      slotModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockSlot),
      });
      userModel.findById.mockReturnValue({
        session: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(mockPatient),
      });
      doctorModel.findById.mockReturnValue({
        session: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(mockDoctor),
      });
      slotModel.findOneAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockSlot),
      });
      // Duplicate booking exists
      bookingModel.findOne.mockReturnValue({
        session: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(mockBooking),
      });

      await expect(service.createBooking(dto, patientId)).rejects.toThrow(
        ConflictException,
      );
    });

    it('throws ConflictException when slot was grabbed concurrently', async () => {
      slotModel.findById
        .mockReturnValueOnce({ exec: jest.fn().mockResolvedValue(mockSlot) }) // pre-transaction check
        .mockReturnValue({
          session: jest.fn().mockReturnThis(),
          exec: jest
            .fn()
            .mockResolvedValue({ ...mockSlot, status: SlotStatus.BOOKED }),
        });

      userModel.findById.mockReturnValue({
        session: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(mockPatient),
      });
      doctorModel.findById.mockReturnValue({
        session: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(mockDoctor),
      });
      // Atomic update returns null — slot was grabbed
      slotModel.findOneAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(service.createBooking(dto, patientId)).rejects.toThrow(
        ConflictException,
      );
    });
  });
});
