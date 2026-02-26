import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Booking,
  BookingDocument,
} from '@app/common/database/schemas/booking.schema';
import {
  AppointmentSlot,
  AppointmentSlotDocument,
} from '@app/common/database/schemas/slot.schema';
import { User, UserDocument } from '@app/common/database/schemas/user.schema';
import {
  Doctor,
  DoctorDocument,
} from '@app/common/database/schemas/doctor.schema';
import {
  BookingStatus,
  SlotStatus,
  UserRole,
} from '@app/common/database/schemas/common.enums';
import { KafkaService } from '@app/common/kafka/kafka.service';
import { KAFKA_TOPICS } from '@app/common/kafka/events/topics';
import {
  PatientCancelBookingDto,
  CancellationResponseDto,
  BookingValidationResponseDto,
} from './dto/patient-booking.dto';
import { formatDate } from '@app/common/utils/get-syria-date';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  // Business rules constants
  private readonly MAX_BOOKINGS_PER_DOCTOR = 1; // One booking per doctor at a time
  private readonly MAX_BOOKINGS_PER_DAY = 3; // Maximum 3 bookings in one day
  private readonly MAX_CANCELLATIONS_PER_DAY = 5; // Maximum 5 cancellations per day

  constructor(
    @InjectModel(Booking.name)
    private bookingModel: Model<BookingDocument>,
    @InjectModel(AppointmentSlot.name)
    private slotModel: Model<AppointmentSlotDocument>,
    @InjectModel(User.name)
    private userModel: Model<UserDocument>,
    @InjectModel(Doctor.name)
    private doctorModel: Model<DoctorDocument>,
    private readonly kafkaService: KafkaService,
  ) {}

  /**
   * Validate if patient can book with a specific doctor
   * Business Rules:
   * 1. Patient can have only ONE active booking with a specific doctor
   * 2. Patient can have maximum THREE bookings per day (across all doctors)
   */
  async validateBooking(
    patientId: string,
    doctorId: string,
    bookingDate: Date,
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

  /**
   * Patient cancels their own booking
   * Business Rule: Maximum 5 cancellations per day
   */
  async patientCancelBooking(
    dto: PatientCancelBookingDto,
  ): Promise<CancellationResponseDto> {
    // Validate IDs
    if (!Types.ObjectId.isValid(dto.bookingId)) {
      throw new BadRequestException('Invalid booking ID');
    }
    if (!Types.ObjectId.isValid(dto.patientId)) {
      throw new BadRequestException('Invalid patient ID');
    }

    // Check cancellation limit
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const cancellationsToday = await this.bookingModel.countDocuments({
      patientId: new Types.ObjectId(dto.patientId),
      'cancellation.cancelledAt': { $gte: today, $lte: endOfDay },
      'cancellation.cancelledBy': UserRole.USER,
      status: BookingStatus.CANCELLED_BY_PATIENT,
    });

    if (cancellationsToday >= this.MAX_CANCELLATIONS_PER_DAY) {
      throw new ForbiddenException(
        `لقد وصلت إلى الحد الأقصى من الإلغاءات اليومية (${this.MAX_CANCELLATIONS_PER_DAY} إلغاءات). يُرجى المحاولة غداً.`,
      );
    }

    const session = await this.bookingModel.db.startSession();
    session.startTransaction();

    try {
      // Find booking with doctor and patient info
      const booking = await this.bookingModel
        .findOne({
          _id: new Types.ObjectId(dto.bookingId),
          patientId: new Types.ObjectId(dto.patientId),
          status: { $in: [BookingStatus.PENDING] },
        })
        .populate<{ doctorId: Doctor }>(
          'doctorId',
          'firstName lastName fcmToken',
        )
        .populate<{ patientId: User }>('patientId', 'username phone') // Added phone here
        .session(session)
        .exec();

      if (!booking) {
        throw new NotFoundException('الحجز غير موجود أو تم إلغاؤه مسبقاً');
      }

      // Update booking status
      booking.status = BookingStatus.CANCELLED_BY_PATIENT;
      booking.cancellation = {
        cancelledBy: UserRole.USER,
        reason: 'User requested cancellation',
        cancelledAt: new Date(),
      };
      await booking.save({ session });

      // Free up the slot
      await this.slotModel.findByIdAndUpdate(
        booking.slotId,
        { $set: { status: SlotStatus.AVAILABLE } },
        { session },
      );

      // Commit transaction
      await session.commitTransaction();

      this.logger.log(
        `✅ Booking ${dto.bookingId} cancelled by patient ${dto.patientId}`,
      );

      // Send notification to doctor via Kafka
      // Ensure doctor and patient are correctly typed after population
      const doctor = booking.doctorId;
      const patient = booking.patientId;

      if (doctor && patient) {
        this.sendDoctorNotification(booking, patient, doctor);
      }

      // Publish Kafka event to refresh slots
      this.publishSlotsRefreshedEvent(
        doctor._id.toString(),
        booking.slotId.toString(),
      );

      const remainingCancellations =
        this.MAX_CANCELLATIONS_PER_DAY - (cancellationsToday + 1);

      return {
        message: 'تم إلغاء الحجز بنجاح',
        bookingId: booking._id.toString(),
        cancelled: true,
        remainingCancellationsToday: remainingCancellations,
      };
    } catch (error) {
      await session.abortTransaction();
      // Improve error handling for potentially undefined message
      const errorMessage =
        error instanceof Error ? error.message : 'An unknown error occurred';
      this.logger.error(
        `Failed to cancel booking: ${errorMessage}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    } finally {
      await session.endSession();
    }
  }

  /**
   * Send notification to doctor when patient cancels
   */
  private sendDoctorNotification(
    booking: any,
    patient: User,
    doctor: Doctor,
  ): void {
    if (!doctor.fcmToken) {
      this.logger.warn(
        `Doctor ${doctor._id.toString()} has no FCM token. Notification not sent.`,
      );
      return;
    }

    const doctorName = `${doctor.firstName} ${doctor.lastName}`;

    const event = {
      eventType: 'BOOKING_CANCELLED_BY_USER',
      timestamp: new Date(),
      data: {
        patientId: patient._id.toString(),
        patientName: patient.username ?? '', // Ensure patient.username is always a string
        doctorId: doctor._id.toString(),
        doctorName,
        fcmToken: doctor.fcmToken,
        bookingId: booking._id?.toString(),
        appointmentDate: formatDate(booking.bookingDate),
        appointmentTime: booking.bookingTime,
        reason: `المريض ألغى الحجز`,
        type: 'USER_CANCELLED' as const,
        // Additional info for doctor
        patientPhone: patient.phone,
        location: booking.location,
      },
      metadata: {
        source: 'user-service',
        version: '1.0',
      },
    };

    try {
      this.kafkaService.emit(KAFKA_TOPICS.BOOKING_CANCELLED_BY_USER, event);
      this.logger.log(
        `📱 Notification sent to doctor ${doctor._id.toString()} about patient cancellation`,
      );
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Failed to send doctor notification: ${err.message}`);
    }
  }

  /**
   * Publish slots refreshed event
   */
  private publishSlotsRefreshedEvent(doctorId: string, slotId: string): void {
    const event = {
      eventType: 'SLOTS_REFRESHED',
      timestamp: new Date(),
      data: {
        doctorId,
        slotIds: [slotId],
        action: 'PATIENT_CANCELLED_BOOKING',
      },
      metadata: {
        source: 'patient-booking-service',
        version: '1.0',
      },
    };

    try {
      this.kafkaService.emit(KAFKA_TOPICS.SLOTS_REFRESHED, event);
      this.logger.log(`Slots refreshed event published`);
    } catch (error) {
      // Use `error.message` directly, it's safer than assuming `error` is an Error object with a message property
      this.logger.error(
        `Failed to publish slots refreshed event: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Get patient's active bookings count
   */
  async getActiveBookingsCount(patientId: string): Promise<{
    totalActive: number;
    byDoctor: { doctorId: string; count: number }[];
    todayCount: number;
  }> {
    if (!Types.ObjectId.isValid(patientId)) {
      throw new BadRequestException('Invalid patient ID');
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    // Total active bookings
    const totalActive = await this.bookingModel.countDocuments({
      patientId: new Types.ObjectId(patientId),
      status: { $in: [BookingStatus.PENDING, BookingStatus.CONFIRMED] },
    });

    // Bookings today
    const todayCount = await this.bookingModel.countDocuments({
      patientId: new Types.ObjectId(patientId),
      bookingDate: { $gte: today, $lte: endOfDay },
      status: { $in: [BookingStatus.PENDING, BookingStatus.CONFIRMED] },
    });

    // Group by doctor
    const byDoctor = await this.bookingModel.aggregate([
      {
        $match: {
          patientId: new Types.ObjectId(patientId),
          status: { $in: [BookingStatus.PENDING, BookingStatus.CONFIRMED] },
        },
      },
      {
        $group: {
          _id: '$doctorId',
          count: { $sum: 1 },
        },
      },
      {
        $project: {
          doctorId: { $toString: '$_id' },
          count: 1,
          _id: 0,
        },
      },
    ]);

    return {
      totalActive,
      todayCount,
      byDoctor,
    };
  }

  /**
   * Get patient's cancellations count for today
   */
  async getCancellationsToday(patientId: string): Promise<{
    count: number;
    remaining: number;
    limit: number;
  }> {
    if (!Types.ObjectId.isValid(patientId)) {
      throw new BadRequestException('Invalid patient ID');
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const count = await this.bookingModel.countDocuments({
      patientId: new Types.ObjectId(patientId),
      'cancellation.cancelledAt': { $gte: today, $lte: endOfDay },
      'cancellation.cancelledBy': UserRole.USER,
      status: BookingStatus.CANCELLED_BY_PATIENT, // Assuming 'CANCELLED' is the correct enum value
    });

    return {
      count,
      remaining: Math.max(0, this.MAX_CANCELLATIONS_PER_DAY - count),
      limit: this.MAX_CANCELLATIONS_PER_DAY,
    };
  }
}
