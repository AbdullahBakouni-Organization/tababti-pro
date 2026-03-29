import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { BookingValidationService } from './booking-validation.service';
import { Booking } from '../database/schemas/booking.schema';
import { AppointmentSlot } from '../database/schemas/slot.schema';
import { BookingStatus, SlotStatus } from '../database/schemas/common.enums';
import { createMockModel } from '../testing/mock-model.factory';

describe('BookingValidationService', () => {
  let service: BookingValidationService;
  let bookingModel: ReturnType<typeof createMockModel>;
  let slotModel: ReturnType<typeof createMockModel>;

  const validPatientId = new Types.ObjectId().toString();
  const validDoctorId = new Types.ObjectId().toString();
  const validSlotId = new Types.ObjectId().toString();
  const futureDate = new Date(Date.now() + 86400000 * 7); // 7 days from now

  const mockSlot = {
    _id: new Types.ObjectId(validSlotId),
    date: futureDate,
    status: SlotStatus.AVAILABLE,
  };

  beforeEach(async () => {
    bookingModel = createMockModel();
    slotModel = createMockModel();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookingValidationService,
        { provide: getModelToken(Booking.name), useValue: bookingModel },
        { provide: getModelToken(AppointmentSlot.name), useValue: slotModel },
      ],
    }).compile();

    service = module.get<BookingValidationService>(BookingValidationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─── Happy path ───────────────────────────────────────────────────────────

  describe('validateBooking() — success', () => {
    it('returns canBook: true when all rules pass', async () => {
      slotModel.findById.mockResolvedValue(mockSlot);
      bookingModel.countDocuments.mockResolvedValue(0);

      const result = await service.validateBooking(
        validPatientId,
        validDoctorId,
        futureDate,
        validSlotId,
      );

      expect(result.canBook).toBe(true);
      expect(result.currentBookingsWithDoctor).toBe(0);
      expect(result.currentBookingsToday).toBe(0);
      expect(result.maxBookingsWithDoctor).toBe(1);
      expect(result.maxBookingsPerDay).toBe(3);
    });
  });

  // ─── ID validation ────────────────────────────────────────────────────────

  describe('validateBooking() — invalid IDs', () => {
    it('throws BadRequestException for invalid patientId', async () => {
      await expect(
        service.validateBooking('bad-id', validDoctorId, futureDate, validSlotId),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for invalid doctorId', async () => {
      await expect(
        service.validateBooking(validPatientId, 'bad-id', futureDate, validSlotId),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for invalid slotId', async () => {
      await expect(
        service.validateBooking(validPatientId, validDoctorId, futureDate, 'bad-id'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── Slot checks ──────────────────────────────────────────────────────────

  describe('validateBooking() — slot rules', () => {
    it('throws NotFoundException when slot does not exist', async () => {
      slotModel.findById.mockResolvedValue(null);

      await expect(
        service.validateBooking(validPatientId, validDoctorId, futureDate, validSlotId),
      ).rejects.toThrow(NotFoundException);
    });

    it('returns canBook: false when slot date is in the past', async () => {
      const pastSlot = {
        ...mockSlot,
        date: new Date(Date.now() - 86400000 * 2), // 2 days ago
      };
      slotModel.findById.mockResolvedValue(pastSlot);

      const result = await service.validateBooking(
        validPatientId,
        validDoctorId,
        futureDate,
        validSlotId,
      );

      expect(result.canBook).toBe(false);
      expect(result.reason).toBeDefined();
    });

    it('returns canBook: false when slot status is not AVAILABLE', async () => {
      slotModel.findById.mockResolvedValue({
        ...mockSlot,
        status: SlotStatus.BOOKED,
      });

      const result = await service.validateBooking(
        validPatientId,
        validDoctorId,
        futureDate,
        validSlotId,
      );

      expect(result.canBook).toBe(false);
      expect(result.reason).toBeDefined();
    });
  });

  // ─── Booking limit rules ──────────────────────────────────────────────────

  describe('validateBooking() — booking limits', () => {
    it('returns canBook: false when patient already has a booking with this doctor', async () => {
      slotModel.findById.mockResolvedValue(mockSlot);
      // First countDocuments call (per doctor) returns 1 (at MAX)
      bookingModel.countDocuments.mockResolvedValueOnce(1);

      const result = await service.validateBooking(
        validPatientId,
        validDoctorId,
        futureDate,
        validSlotId,
      );

      expect(result.canBook).toBe(false);
      expect(result.currentBookingsWithDoctor).toBe(1);
      expect(result.reason).toContain('طبيب');
    });

    it('returns canBook: false when patient has reached daily limit of 3', async () => {
      slotModel.findById.mockResolvedValue(mockSlot);
      // Per-doctor count = 0 (passes rule 1)
      bookingModel.countDocuments
        .mockResolvedValueOnce(0)
        // Daily count = 3 (at MAX)
        .mockResolvedValueOnce(3);

      const result = await service.validateBooking(
        validPatientId,
        validDoctorId,
        futureDate,
        validSlotId,
      );

      expect(result.canBook).toBe(false);
      expect(result.currentBookingsToday).toBe(3);
      expect(result.maxBookingsPerDay).toBe(3);
    });

    it('queries bookings with PENDING status filter', async () => {
      slotModel.findById.mockResolvedValue(mockSlot);
      bookingModel.countDocuments.mockResolvedValue(0);

      await service.validateBooking(
        validPatientId,
        validDoctorId,
        futureDate,
        validSlotId,
      );

      expect(bookingModel.countDocuments).toHaveBeenCalledWith(
        expect.objectContaining({
          status: expect.objectContaining({ $in: [BookingStatus.PENDING] }),
        }),
      );
    });
  });
});
