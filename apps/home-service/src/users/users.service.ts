import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Model, Types, Connection } from 'mongoose';
import {
  Booking,
  BookingDocument,
} from '@app/common/database/schemas/booking.schema';
import {
  AppointmentSlot,
  AppointmentSlotDocument,
} from '@app/common/database/schemas/slot.schema';
import { User, UserDocument } from '@app/common/database/schemas/user.schema';
import { Doctor } from '@app/common/database/schemas/doctor.schema';
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
import { GetUserBookingsDto } from './dto/get-user-bookings.dto';
import {
  BookingResponseItem,
  UserBookingsResponse,
} from './interfaces/user-bookings-response.interface';
import { CacheService } from '@app/common/cache/cache.service';
import {
  UpdateUserDto,
  UpdateUserResponseDto,
} from './dto/update-user-info.dto';
import { MinioService } from '../minio/minio.service';
import { uploadUserProfileImage } from '@app/common/utils/upload-profile-images.util';
import { invalidateBookingCaches } from '@app/common/utils/cache-invalidation.util';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  // Business rules constants
  private readonly MAX_BOOKINGS_PER_DOCTOR = 1; // One booking per doctor at a time
  private readonly MAX_BOOKINGS_PER_DAY = 3; // Maximum 3 bookings in one day
  private readonly MAX_CANCELLATIONS_PER_DAY = 5; // Maximum 5 cancellations per day
  private readonly CACHE_TTL = 7200; // 2 hour in ms
  constructor(
    @InjectModel(Booking.name)
    private bookingModel: Model<BookingDocument>,
    @InjectModel(AppointmentSlot.name)
    private slotModel: Model<AppointmentSlotDocument>,
    @InjectModel(User.name)
    private userModel: Model<UserDocument>,
    private readonly kafkaService: KafkaService,
    private readonly cacheManager: CacheService,
    @InjectConnection() private connection: Connection,
    private minioService: MinioService,
  ) {}

  /**
   * Validate if patient can book with a specific doctor
   * Business Rules:
   * 1. Patient can have only ONE active booking with a specific doctor
   * 2. Patient can have maximum THREE bookings per day (across all doctors)
   */
  // async validateBooking(
  //   patientId: string,
  //   doctorId: string,
  //   bookingDate: Date,
  // ): Promise<BookingValidationResponseDto> {
  //   this.logger.log(
  //     `Validating booking for patient ${patientId} with doctor ${doctorId}`,
  //   );

  //   if (!Types.ObjectId.isValid(patientId)) {
  //     throw new BadRequestException('Invalid patient ID');
  //   }
  //   if (!Types.ObjectId.isValid(doctorId)) {
  //     throw new BadRequestException('Invalid doctor ID');
  //   }

  //   // Rule 1: Check if patient already has an active booking with this doctor
  //   const existingBookingWithDoctor = await this.bookingModel.countDocuments({
  //     patientId: new Types.ObjectId(patientId),
  //     doctorId: new Types.ObjectId(doctorId),
  //     status: { $in: [BookingStatus.PENDING] },
  //   });

  //   if (existingBookingWithDoctor >= this.MAX_BOOKINGS_PER_DOCTOR) {
  //     return {
  //       canBook: false,
  //       reason: `لديك حجز نشط بالفعل مع هذا الطبيب. يُسمح بحجز واحد فقط لكل طبيب في نفس الوقت.`,
  //       currentBookingsWithDoctor: existingBookingWithDoctor,
  //       currentBookingsToday: 0,
  //       maxBookingsWithDoctor: this.MAX_BOOKINGS_PER_DOCTOR,
  //       maxBookingsPerDay: this.MAX_BOOKINGS_PER_DAY,
  //     };
  //   }

  //   // Rule 2: Check if patient has reached daily booking limit
  //   const startOfDay = new Date(bookingDate);
  //   startOfDay.setHours(0, 0, 0, 0);
  //   const endOfDay = new Date(bookingDate);
  //   endOfDay.setHours(23, 59, 59, 999);

  //   const bookingsToday = await this.bookingModel.countDocuments({
  //     patientId: new Types.ObjectId(patientId),
  //     bookingDate: { $gte: startOfDay, $lte: endOfDay },
  //     status: { $in: [BookingStatus.PENDING] },
  //   });

  //   if (bookingsToday >= this.MAX_BOOKINGS_PER_DAY) {
  //     return {
  //       canBook: false,
  //       reason: `لقد وصلت إلى الحد الأقصى من الحجوزات اليومية (${this.MAX_BOOKINGS_PER_DAY} حجوزات). يُرجى المحاولة غداً أو إلغاء حجز موجود.`,
  //       currentBookingsWithDoctor: existingBookingWithDoctor,
  //       currentBookingsToday: bookingsToday,
  //       maxBookingsWithDoctor: this.MAX_BOOKINGS_PER_DOCTOR,
  //       maxBookingsPerDay: this.MAX_BOOKINGS_PER_DAY,
  //     };
  //   }

  //   // All validations passed
  //   return {
  //     canBook: true,
  //     currentBookingsWithDoctor: existingBookingWithDoctor,
  //     currentBookingsToday: bookingsToday,
  //     maxBookingsWithDoctor: this.MAX_BOOKINGS_PER_DOCTOR,
  //     maxBookingsPerDay: this.MAX_BOOKINGS_PER_DAY,
  //   };
  // }

  async validateBooking(
    patientId: string,
    doctorId: string,
    bookingDate: Date,
    slotId: string, // 👈 add this param
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
  /**
   * Patient cancels their own booking
   * Business Rule: Maximum 5 cancellations per day
   */
  async patientCancelBooking(
    dto: PatientCancelBookingDto,
    patientId: string,
  ): Promise<CancellationResponseDto> {
    // Validate IDs
    if (!Types.ObjectId.isValid(dto.bookingId)) {
      throw new BadRequestException('Invalid booking ID');
    }
    if (!Types.ObjectId.isValid(patientId)) {
      throw new BadRequestException('Invalid patient ID');
    }

    // Check cancellation limit
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const cancellationsToday = await this.bookingModel.countDocuments({
      patientId: new Types.ObjectId(patientId),
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
          patientId: new Types.ObjectId(patientId),
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
        `✅ Booking ${dto.bookingId} cancelled by patient ${patientId}`,
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

      await invalidateBookingCaches(
        this.cacheManager,
        doctor._id.toString(),
        patientId,
        this.logger,
      );
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

  async updateFCMToken(
    userId: string,
    fcmToken: string,
  ): Promise<{
    message: string;
    userId: string;
    tokenUpdated: boolean;
  }> {
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Invalid user ID');
    }

    if (!fcmToken || fcmToken.trim().length === 0) {
      throw new BadRequestException('FCM token is required');
    }

    const user = await this.userModel.findById(userId).exec();

    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    // Update FCM token
    user.fcmToken = fcmToken;
    await user.save();

    this.logger.log(`FCM token updated for user ${userId}`);

    return {
      message: 'تم تحديث رمز FCM بنجاح',
      userId: user._id.toString(),
      tokenUpdated: true,
    };
  }

  async getUserBookings(
    userId: string,
    dto: GetUserBookingsDto,
  ): Promise<UserBookingsResponse> {
    const { status, page = 1, limit = 10 } = dto;
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Invalid user ID');
    }
    // ✅ Cache key unique per user + filter + page
    const cacheKey = `user_bookings:${userId}:${status ?? 'all'}:page${page}:limit${limit}`;

    // ✅ Try cache first — only for cancelled bookings
    if (status === BookingStatus.CANCELLED) {
      const cached =
        await this.cacheManager.get<UserBookingsResponse>(cacheKey);
      if (cached) {
        this.logger.log(`✅ Cache HIT for ${cacheKey}`);
        return cached;
      }
      this.logger.log(`❌ Cache MISS for ${cacheKey}`);
    }

    // ✅ Build status filter
    const statusFilter = this.buildStatusFilter(status);

    const skip = (page - 1) * limit;

    // ✅ Aggregate for full data
    const [result] = await this.bookingModel.aggregate([
      {
        $match: {
          patientId: new Types.ObjectId(userId),
          status: { $in: statusFilter },
        },
      },
      {
        $facet: {
          // Total count for pagination
          totalCount: [{ $count: 'count' }],

          // Paginated data
          data: [
            { $sort: { createdAt: -1 } },
            { $skip: skip },
            { $limit: limit },

            // Join slot
            {
              $lookup: {
                from: 'appointment_slots',
                localField: 'slotId',
                foreignField: '_id',
                as: 'slot',
              },
            },
            { $unwind: { path: '$slot', preserveNullAndEmptyArrays: false } },

            // Join doctor
            {
              $lookup: {
                from: 'doctors',
                localField: 'doctorId',
                foreignField: '_id',
                pipeline: [
                  {
                    $project: {
                      firstName: 1,
                      lastName: 1,
                      image: 1,
                    },
                  },
                ],
                as: 'doctor',
              },
            },
            { $unwind: { path: '$doctor', preserveNullAndEmptyArrays: false } },

            // Project only needed fields
            {
              $project: {
                _id: 1,
                status: 1,
                bookingDate: 1,
                cancellation: 1,
                'slot.startTime': 1,
                'slot.endTime': 1,
                'slot.location': 1,
                'slot.price': 1,
                'doctor.firstName': 1,
                'doctor.lastName': 1,
                'doctor.image': 1,
              },
            },
          ],
        },
      },
    ]);

    const total = result.totalCount[0]?.count ?? (0 as number);
    const totalPages = Math.ceil(total / limit);

    // ✅ Format response
    const data: BookingResponseItem[] = result.data.map((booking: any) =>
      this.formatBooking(booking, status),
    );

    const response: UserBookingsResponse = {
      bookings: {
        data,
        total,
      },
      meta: {
        total,
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };

    // ✅ Cache only cancelled bookings for 1 hour
    if (status === BookingStatus.CANCELLED) {
      await this.cacheManager.set(cacheKey, response, 60, this.CACHE_TTL);
      this.logger.log(`💾 Cached cancelled bookings for user ${userId}`);
    }

    return response;
  }

  // ✅ Map filter status → DB statuses
  private buildStatusFilter(status?: BookingStatus): BookingStatus[] {
    switch (status) {
      case BookingStatus.CANCELLED:
        return [
          BookingStatus.CANCELLED_BY_DOCTOR, // cancelled by doctor/system
          BookingStatus.CANCELLED_BY_PATIENT, // cancelled by patient
        ];
      case BookingStatus.COMPLETED:
        return [BookingStatus.COMPLETED];
      case BookingStatus.PENDING:
        return [BookingStatus.PENDING];
      default:
        // No filter → return all statuses
        return [
          BookingStatus.PENDING,
          BookingStatus.COMPLETED,
          BookingStatus.CANCELLED_BY_DOCTOR,
          BookingStatus.CANCELLED_BY_PATIENT,
        ];
    }
  }

  // ✅ Format each booking item
  private formatBooking(
    booking: any,
    filter?: BookingStatus,
  ): BookingResponseItem {
    const isCancelled =
      filter === BookingStatus.CANCELLED_BY_DOCTOR ||
      filter === BookingStatus.CANCELLED_BY_PATIENT ||
      booking.status === BookingStatus.CANCELLED_BY_DOCTOR ||
      booking.status === BookingStatus.CANCELLED_BY_PATIENT ||
      booking.status === BookingStatus.NEEDS_RESCHEDULE;

    const item: BookingResponseItem = {
      bookingId: booking._id.toString(),
      status: booking.status,
      bookingDate: formatDate(booking.bookingDate),
      slot: {
        startTime: booking.slot.startTime,
        endTime: booking.slot.endTime,
        location: {
          type: booking.slot.location?.type,
          entity_name: booking.slot.location?.entity_name,
          address: booking.slot.location?.address,
        },
        inspectionPrice: booking.slot.price,
      },
      doctor: {
        fullName: `${booking.doctor.firstName} ${booking.doctor.lastName}`,
        image: booking.doctor.image ?? null,
      },
    };

    // ✅ Add cancellation info only if cancelled
    if (isCancelled && booking.cancellation) {
      item.cancellation = {
        cancelledBy: booking.cancellation.cancelledBy,
        // Return reason only if cancelled by doctor or system
        reason:
          booking.cancellation.cancelledBy === 'PATIENT'
            ? undefined
            : booking.cancellation.reason,
      };
    }

    return item;
  }

  async updateUser(
    userId: string,
    updateUserDto: UpdateUserDto,
    newImage: Express.Multer.File | undefined,
  ): Promise<UpdateUserResponseDto> {
    if (!Types.ObjectId.isValid(userId)) {
      throw new NotFoundException(`Invalid user ID: ${userId}`);
    }

    const session = await this.connection.startSession();
    session.startTransaction();

    try {
      const user = await this.userModel
        .findById(userId)
        .session(session)
        .exec();

      if (!user) {
        throw new NotFoundException(`User with ID ${userId} not found`);
      }

      if (updateUserDto.username && updateUserDto.username !== user.username) {
        const existingUser = await this.userModel
          .findOne({ username: updateUserDto.username })
          .session(session)
          .exec();

        if (existingUser) {
          throw new ConflictException('Username already exists');
        }
      }

      if (updateUserDto.username !== undefined) {
        user.username = updateUserDto.username;
      }
      if (updateUserDto.gender !== undefined) {
        user.gender = updateUserDto.gender;
      }
      if (updateUserDto.city !== undefined) {
        user.city = updateUserDto.city;
      }
      if (updateUserDto.DataofBirth !== undefined) {
        user.DataofBirth = updateUserDto.DataofBirth;
      }

      if (
        newImage !== undefined &&
        user.profileImageFileName &&
        user.profileImageBucket
      ) {
        try {
          await this.minioService.deleteFile(
            user.profileImageBucket,
            user.profileImageFileName,
          );
          this.logger.log(`Old profile image deleted for user ${userId}`);
        } catch (error) {
          const err = error as Error;
          this.logger.warn(`Failed to delete old image: ${err.message}`);
        }
      }

      // Upload new image
      const uploadResult = await uploadUserProfileImage(
        this.minioService,
        userId,
        newImage,
      );

      // Update user record
      if (uploadResult) {
        user.profileImage = uploadResult.url;
        user.profileImageFileName = uploadResult.fileName;
        user.profileImageBucket = uploadResult.bucket;
      }
      await user.save();

      this.logger.log(`Profile image updated for user ${userId}`);

      await user.save({ session });

      await session.commitTransaction();

      return {
        message: 'User updated successfully',
        user: {
          _id: user._id.toString(),
          authAccountId: user.authAccountId.toString(),
          username: user.username,
          phone: user.phone,
          gender: user.gender,
          image: user.profileImage,
          city: user.city,
          DataofBirth: user.DataofBirth.toISOString(),
          isVerified: true,
        },
      };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      await session.endSession();
    }
  }

  async getUserProfile(userId: string) {
    const user = await this.userModel
      .findById(userId)
      .select('-password')
      .exec();

    if (!user) {
      throw new BadRequestException('User not found');
    }

    return {
      id: user._id.toString(),
      username: user.username,
      phone: user.phone,
      city: user.city,
      gender: user.gender,
      DataofBirth: user.DataofBirth,
      profileImage: user.profileImage,
    };
  }
}
