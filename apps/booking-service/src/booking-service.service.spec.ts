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
import { invalidateBookingCaches } from '@app/common/utils/cache-invalidation.util';

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
  const mockBookingId = new Types.ObjectId();
  const mockBooking = {
    _id: mockBookingId,
    status: BookingStatus.PENDING,
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    bookingModel = createMockModel();
    slotModel = createMockModel();
    userModel = createMockModel();
    doctorModel = createMockModel();
    cacheService = createMockCacheService();
    bookingValidationService = {
      validateBooking: jest.fn().mockResolvedValue({ canBook: true }),
    };

    mockSession.startTransaction.mockClear();
    mockSession.commitTransaction.mockReset().mockResolvedValue(undefined);
    mockSession.abortTransaction.mockReset().mockResolvedValue(undefined);
    mockSession.endSession.mockReset().mockResolvedValue(undefined);

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

  // ─── Helper to set up happy-path mocks ──────────────────────────────────

  function setupHappyPathMocks(
    overrides: {
      slot?: Record<string, unknown>;
      doctor?: Record<string, unknown>;
    } = {},
  ) {
    const slot = { ...mockSlot, ...overrides.slot };
    const doctor = { ...mockDoctor, ...overrides.doctor };

    slotModel.findById.mockReturnValue({
      exec: jest.fn().mockResolvedValue(slot),
    });
    userModel.findById.mockReturnValue({
      session: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue(mockPatient),
    });
    doctorModel.findById.mockReturnValue({
      session: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue(doctor),
    });
    slotModel.findOneAndUpdate.mockReturnValue({
      exec: jest.fn().mockResolvedValue(slot),
    });
    bookingModel.findOne.mockReturnValue({
      session: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue(null),
    });
    bookingModel.create.mockResolvedValue([mockBooking]);
  }

  // ─── Happy path ───────────────────────────────────────────────────────────

  describe('createBooking() - success', () => {
    const dto = { doctorId, slotId, createdBy: 'patient', note: 'First visit' };

    beforeEach(() => {
      setupHappyPathMocks();
    });

    it('creates booking and returns success response', async () => {
      const result = await service.createBooking(dto as any, patientId);

      expect(result.success).toBe(true);
      expect(result.message).toContain('Booking created successfully');
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

    it('passes correct booking fields to create', async () => {
      await service.createBooking(dto as any, patientId);

      const createArgs = bookingModel.create.mock.calls[0][0][0];
      expect(createArgs).toEqual(
        expect.objectContaining({
          patientId: expect.any(Types.ObjectId),
          doctorId: expect.any(Types.ObjectId),
          slotId: expect.any(Types.ObjectId),
          status: BookingStatus.PENDING,
          bookingDate: mockSlot.date,
          bookingTime: mockSlot.startTime,
          bookingEndTime: mockSlot.endTime,
          location: mockSlot.location,
          price: mockSlot.price,
          createdBy: 'patient',
          note: 'First visit',
        }),
      );
    });

    it('commits transaction on success', async () => {
      await service.createBooking(dto as any, patientId);
      expect(mockSession.commitTransaction).toHaveBeenCalled();
      expect(mockSession.abortTransaction).not.toHaveBeenCalled();
    });

    it('always ends session even on success', async () => {
      await service.createBooking(dto as any, patientId);
      expect(mockSession.endSession).toHaveBeenCalled();
    });

    it('calls invalidateBookingCaches with correct args after commit', async () => {
      await service.createBooking(dto as any, patientId);

      expect(invalidateBookingCaches).toHaveBeenCalledWith(
        cacheService,
        doctorId,
        patientId,
        expect.anything(), // logger
      );
    });

    it('uses slot.price when available', async () => {
      setupHappyPathMocks({ slot: { price: 3000 } });
      await service.createBooking(dto as any, patientId);

      const createArgs = bookingModel.create.mock.calls[0][0][0];
      expect(createArgs.price).toBe(3000);
    });

    it('falls back to doctor.inspectionPrice when slot.price is falsy', async () => {
      setupHappyPathMocks({
        slot: { price: 0 },
        doctor: { inspectionPrice: 1500 },
      });
      await service.createBooking(dto as any, patientId);

      const createArgs = bookingModel.create.mock.calls[0][0][0];
      expect(createArgs.price).toBe(1500);
    });

    it('falls back to 0 when both slot.price and doctor.inspectionPrice are falsy', async () => {
      setupHappyPathMocks({
        slot: { price: 0 },
        doctor: { inspectionPrice: 0 },
      });
      await service.createBooking(dto as any, patientId);

      const createArgs = bookingModel.create.mock.calls[0][0][0];
      expect(createArgs.price).toBe(0);
    });

    it('reserves slot with atomic findOneAndUpdate using AVAILABLE status', async () => {
      await service.createBooking(dto as any, patientId);

      expect(slotModel.findOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          _id: expect.any(Types.ObjectId),
          doctorId: expect.any(Types.ObjectId),
          status: SlotStatus.AVAILABLE,
        }),
        { $set: { status: SlotStatus.BOOKED } },
        { new: true, session: mockSession },
      );
    });
  });

  // ─── Input validation ─────────────────────────────────────────────────────

  describe('createBooking() - input validation', () => {
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

    it('includes validation reason in ForbiddenException message', async () => {
      slotModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockSlot),
      });
      bookingValidationService.validateBooking.mockResolvedValue({
        canBook: false,
        reason: 'Max bookings per day exceeded',
      });

      await expect(
        service.createBooking({ doctorId, slotId } as any, patientId),
      ).rejects.toThrow('Max bookings per day exceeded');
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

    it('throws NotFoundException with patient ID in message', async () => {
      slotModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockSlot),
      });
      userModel.findById.mockReturnValue({
        session: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(
        service.createBooking({ doctorId, slotId } as any, patientId),
      ).rejects.toThrow(patientId);
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

    it('throws NotFoundException with doctor ID in message', async () => {
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
      ).rejects.toThrow(doctorId);
    });
  });

  // ─── Transaction & race condition handling ────────────────────────────────

  describe('createBooking() - transactions & race conditions', () => {
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

    it('always ends session even on error', async () => {
      slotModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockSlot),
      });
      userModel.findById.mockReturnValue({
        session: jest.fn().mockReturnThis(),
        exec: jest.fn().mockRejectedValue(new Error('boom')),
      });

      await expect(service.createBooking(dto, patientId)).rejects.toThrow(
        'boom',
      );
      expect(mockSession.endSession).toHaveBeenCalled();
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

    it('duplicate booking error includes descriptive message', async () => {
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
        exec: jest.fn().mockResolvedValue(mockBooking),
      });

      await expect(service.createBooking(dto, patientId)).rejects.toThrow(
        'You already have a booking with this doctor at this time',
      );
    });

    it('throws ConflictException when slot was grabbed concurrently (already booked)', async () => {
      const bookedSlot = { ...mockSlot, status: SlotStatus.BOOKED };

      slotModel.findById
        .mockReturnValueOnce({
          exec: jest.fn().mockResolvedValue(mockSlot),
        }) // pre-transaction check
        .mockReturnValue({
          session: jest.fn().mockReturnThis(),
          exec: jest.fn().mockResolvedValue(bookedSlot),
        });

      userModel.findById.mockReturnValue({
        session: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(mockPatient),
      });
      doctorModel.findById.mockReturnValue({
        session: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(mockDoctor),
      });
      // Atomic update returns null -- slot was grabbed
      slotModel.findOneAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(service.createBooking(dto, patientId)).rejects.toThrow(
        ConflictException,
      );
    });

    it('throws NotFoundException when slot disappears during reserveSlot', async () => {
      slotModel.findById
        .mockReturnValueOnce({
          exec: jest.fn().mockResolvedValue(mockSlot),
        }) // pre-transaction check
        .mockReturnValue({
          session: jest.fn().mockReturnThis(),
          exec: jest.fn().mockResolvedValue(null),
        }); // slot deleted between checks

      userModel.findById.mockReturnValue({
        session: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(mockPatient),
      });
      doctorModel.findById.mockReturnValue({
        session: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(mockDoctor),
      });
      slotModel.findOneAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(service.createBooking(dto, patientId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('includes slot ID in NotFoundException message when slot disappears', async () => {
      slotModel.findById
        .mockReturnValueOnce({
          exec: jest.fn().mockResolvedValue(mockSlot),
        })
        .mockReturnValue({
          session: jest.fn().mockReturnThis(),
          exec: jest.fn().mockResolvedValue(null),
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
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(service.createBooking(dto, patientId)).rejects.toThrow(
        `Slot with ID ${slotId} not found`,
      );
    });

    it('throws BadRequestException when slot belongs to a different doctor', async () => {
      const otherDoctorId = new Types.ObjectId();
      const slotWithOtherDoctor = {
        ...mockSlot,
        status: SlotStatus.AVAILABLE,
        doctorId: otherDoctorId,
      };

      slotModel.findById
        .mockReturnValueOnce({
          exec: jest.fn().mockResolvedValue(mockSlot),
        }) // pre-transaction
        .mockReturnValue({
          session: jest.fn().mockReturnThis(),
          exec: jest.fn().mockResolvedValue(slotWithOtherDoctor),
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
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(service.createBooking(dto, patientId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('includes doctor ID in error when slot belongs to different doctor', async () => {
      const otherDoctorId = new Types.ObjectId();
      const slotWithOtherDoctor = {
        ...mockSlot,
        status: SlotStatus.AVAILABLE,
        doctorId: otherDoctorId,
      };

      slotModel.findById
        .mockReturnValueOnce({
          exec: jest.fn().mockResolvedValue(mockSlot),
        })
        .mockReturnValue({
          session: jest.fn().mockReturnThis(),
          exec: jest.fn().mockResolvedValue(slotWithOtherDoctor),
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
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(service.createBooking(dto, patientId)).rejects.toThrow(
        `Slot does not belong to doctor ${doctorId}`,
      );
    });

    it('does not call invalidateBookingCaches when transaction fails', async () => {
      slotModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockSlot),
      });
      userModel.findById.mockReturnValue({
        session: jest.fn().mockReturnThis(),
        exec: jest.fn().mockRejectedValue(new Error('fail')),
      });

      await expect(service.createBooking(dto, patientId)).rejects.toThrow();
      expect(invalidateBookingCaches).not.toHaveBeenCalled();
    });

    it('does not commit transaction when booking create fails', async () => {
      setupHappyPathMocks();
      bookingModel.create.mockRejectedValue(new Error('Write concern error'));

      await expect(service.createBooking(dto, patientId)).rejects.toThrow(
        'Write concern error',
      );
      expect(mockSession.commitTransaction).not.toHaveBeenCalled();
      expect(mockSession.abortTransaction).toHaveBeenCalled();
    });
  });

  // ─── Duplicate booking query validation ──────────────────────────────────

  describe('createBooking() - duplicate booking check', () => {
    const dto = { doctorId, slotId, createdBy: 'patient' } as any;

    it('queries for PENDING and CONFIRMED statuses only', async () => {
      setupHappyPathMocks();
      await service.createBooking(dto, patientId);

      expect(bookingModel.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          status: { $in: [BookingStatus.PENDING, BookingStatus.CONFIRMED] },
        }),
      );
    });

    it('queries with correct patient and doctor IDs', async () => {
      setupHappyPathMocks();
      await service.createBooking(dto, patientId);

      const findOneArgs = bookingModel.findOne.mock.calls[0][0];
      expect(findOneArgs.patientId.toString()).toBe(patientId);
      expect(findOneArgs.doctorId.toString()).toBe(doctorId);
    });
  });
});
