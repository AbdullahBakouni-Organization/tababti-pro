import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Booking, BookingDocument } from '../database/schemas/booking.schema';
import {
  AppointmentSlot,
  AppointmentSlotDocument,
} from '../database/schemas/slot.schema';
import { BookingStatus, SlotStatus } from '../database/schemas/common.enums';

/**
 * Booking validation response
 */
export class BookingValidationResponseDto {
  canBook: boolean;
  reason?: string;
  currentBookingsWithDoctor: number;
  currentBookingsToday: number;
  maxBookingsWithDoctor: number;
  maxBookingsPerDay: number;
}

/**
 * Shared booking validation logic used by both home-service and booking-service.
 * Extracted from UsersService to eliminate cross-service imports.
 */
@Injectable()
export class BookingValidationService {
  private readonly logger = new Logger(BookingValidationService.name);

  // Business rules constants
  private readonly MAX_BOOKINGS_PER_DOCTOR = 1;
  private readonly MAX_BOOKINGS_PER_DAY = 3;

  constructor(
    @InjectModel(Booking.name)
    private bookingModel: Model<BookingDocument>,
    @InjectModel(AppointmentSlot.name)
    private slotModel: Model<AppointmentSlotDocument>,
  ) {}

  /**
   * Validate if patient can book with a specific doctor
   * Business Rules:
   * 1. Slot must exist and not be in the past
   * 2. Slot must be available
   * 3. Patient can have only ONE active booking with a specific doctor
   * 4. Patient can have maximum THREE bookings per day (across all doctors)
   */
  async validateBooking(
    patientId: string,
    doctorId: string,
    bookingDate: Date,
    slotId: string,
  ): Promise<BookingValidationResponseDto> {
    this.logger.log(
      `Validating booking for patient ${patientId} with doctor ${doctorId}`,
    );

    if (!Types.ObjectId.isValid(patientId)) {
      throw new BadRequestException('Invalid patient ID');
    }
    if (!Types.ObjectId.isValid(doctorId)) {
      throw new BadRequestException('Invalid doctor ID');
    }
    if (!Types.ObjectId.isValid(slotId)) {
      throw new BadRequestException('Invalid slot ID');
    }

    // Rule 0: Check if slot exists and its date is not in the past
    const slot = await this.slotModel.findById(slotId);
    if (!slot) {
      throw new NotFoundException('Slot not found');
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const slotDate = new Date(slot.date);
    slotDate.setHours(0, 0, 0, 0);

    if (slotDate < today) {
      return {
        canBook: false,
        reason: 'لا يمكن الحجز في موعد قد مضى. يُرجى اختيار موعد مستقبلي.',
        currentBookingsWithDoctor: 0,
        currentBookingsToday: 0,
        maxBookingsWithDoctor: this.MAX_BOOKINGS_PER_DOCTOR,
        maxBookingsPerDay: this.MAX_BOOKINGS_PER_DAY,
      };
    }

    // Rule 0.1: Check if slot is still available
    if (slot.status !== SlotStatus.AVAILABLE) {
      return {
        canBook: false,
        reason: 'هذا الموعد غير متاح. يُرجى اختيار موعد آخر.',
        currentBookingsWithDoctor: 0,
        currentBookingsToday: 0,
        maxBookingsWithDoctor: this.MAX_BOOKINGS_PER_DOCTOR,
        maxBookingsPerDay: this.MAX_BOOKINGS_PER_DAY,
      };
    }

    // Rule 1: Check if patient already has an active booking with this doctor
    const existingBookingWithDoctor = await this.bookingModel.countDocuments({
      patientId: new Types.ObjectId(patientId),
      doctorId: new Types.ObjectId(doctorId),
      status: { $in: [BookingStatus.PENDING] },
    });

    if (existingBookingWithDoctor >= this.MAX_BOOKINGS_PER_DOCTOR) {
      return {
        canBook: false,
        reason: `لديك حجز نشط بالفعل مع هذا الطبيب. يُسمح بحجز واحد فقط لكل طبيب في نفس الوقت.`,
        currentBookingsWithDoctor: existingBookingWithDoctor,
        currentBookingsToday: 0,
        maxBookingsWithDoctor: this.MAX_BOOKINGS_PER_DOCTOR,
        maxBookingsPerDay: this.MAX_BOOKINGS_PER_DAY,
      };
    }

    // Rule 2: Check if patient has reached daily booking limit
    const startOfDay = new Date(bookingDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(bookingDate);
    endOfDay.setHours(23, 59, 59, 999);

    const bookingsToday = await this.bookingModel.countDocuments({
      patientId: new Types.ObjectId(patientId),
      bookingDate: { $gte: startOfDay, $lte: endOfDay },
      status: { $in: [BookingStatus.PENDING] },
    });

    if (bookingsToday >= this.MAX_BOOKINGS_PER_DAY) {
      return {
        canBook: false,
        reason: `لقد وصلت إلى الحد الأقصى من الحجوزات اليومية (${this.MAX_BOOKINGS_PER_DAY} حجوزات). يُرجى المحاولة غداً أو إلغاء حجز موجود.`,
        currentBookingsWithDoctor: existingBookingWithDoctor,
        currentBookingsToday: bookingsToday,
        maxBookingsWithDoctor: this.MAX_BOOKINGS_PER_DOCTOR,
        maxBookingsPerDay: this.MAX_BOOKINGS_PER_DAY,
      };
    }

    // All validations passed
    return {
      canBook: true,
      currentBookingsWithDoctor: existingBookingWithDoctor,
      currentBookingsToday: bookingsToday,
      maxBookingsWithDoctor: this.MAX_BOOKINGS_PER_DOCTOR,
      maxBookingsPerDay: this.MAX_BOOKINGS_PER_DAY,
    };
  }
}
