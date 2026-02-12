import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, ClientSession } from 'mongoose';
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
} from '@app/common/database/schemas/common.enums';
import { CreateBookingDto, BookingResponseDto } from './dto/create-booking.dto';
// import { KafkaService } from '@app/common/kafka/kafka.service';
// import { KAFKA_TOPICS } from '@app/common/kafka/events/topics';
import { CacheService } from '@app/common/cache/cache.service';

@Injectable()
export class BookingService {
  private readonly logger = new Logger(BookingService.name);

  constructor(
    @InjectModel(Booking.name) private bookingModel: Model<BookingDocument>,
    @InjectModel(AppointmentSlot.name)
    private slotModel: Model<AppointmentSlotDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Doctor.name) private doctorModel: Model<DoctorDocument>,
    // private readonly kafkaService: KafkaService,
    private readonly cacheService: CacheService,
  ) {}

  /**
   * Create a new booking with atomic slot reservation
   * Uses MongoDB transactions to ensure consistency
   */
  async createBooking(
    createBookingDto: CreateBookingDto,
  ): Promise<BookingResponseDto> {
    this.logger.log(
      `Creating booking for patient ${createBookingDto.patientId}, slot ${createBookingDto.slotId}`,
    );

    // Validate IDs
    this.validateObjectIds(createBookingDto);

    // Start a MongoDB session for transaction
    const session = await this.bookingModel.db.startSession();
    session.startTransaction();

    try {
      // Step 1: Validate patient exists
      const patient = await this.userModel
        .findById(createBookingDto.patientId)
        .session(session)
        .exec();

      if (!patient) {
        throw new NotFoundException(
          `Patient with ID ${createBookingDto.patientId} not found`,
        );
      }

      // Step 2: Validate doctor exists
      const doctor = await this.doctorModel
        .findById(createBookingDto.doctorId)
        .session(session)
        .exec();

      if (!doctor) {
        throw new NotFoundException(
          `Doctor with ID ${createBookingDto.doctorId} not found`,
        );
      }

      // Step 3: Reserve the slot (atomic update)
      const slot = await this.reserveSlot(
        createBookingDto.slotId,
        createBookingDto.doctorId,
        session,
      );

      // Step 4: Validate booking doesn't already exist (double booking prevention)
      await this.validateNoDuplicateBooking(
        createBookingDto.patientId,
        createBookingDto.doctorId,
        slot.date,
        slot.startTime,
        session,
      );

      // Step 5: Create the booking
      const booking = await this.bookingModel.create(
        [
          {
            patientId: new Types.ObjectId(createBookingDto.patientId),
            doctorId: new Types.ObjectId(createBookingDto.doctorId),
            slotId: new Types.ObjectId(createBookingDto.slotId),
            status: BookingStatus.PENDING,
            bookingDate: slot.date,
            bookingTime: slot.startTime,
            bookingEndTime: slot.endTime,
            location: slot.location,
            price: slot.price || doctor.inspectionPrice || 0,
            createdBy: createBookingDto.createdBy,
            note: createBookingDto.note,
          },
        ],
        { session },
      );

      // Commit the transaction
      await session.commitTransaction();

      this.logger.log(
        `Booking created successfully: ${booking[0]._id.toString()}`,
      );

      // Step 6: Publish Kafka event (after commit)
      // await this.publishBookingCreatedEvent(booking[0], patient, doctor, slot);

      // Step 7: Invalidate cache
      await this.invalidateBookingCaches(
        createBookingDto.doctorId,
        createBookingDto.patientId,
      );

      // Step 8: Return response
      return this.mapToResponseDto(booking[0]);
    } catch (error) {
      // Rollback transaction on error
      await session.abortTransaction();

      const err = error as Error;
      this.logger.error(`Failed to create booking: ${err.message}`, err.stack);
      throw error;
    } finally {
      await session.endSession();
    }
  }

  /**
   * Reserve a slot atomically
   * Uses findOneAndUpdate with status check to prevent race conditions
   */
  private async reserveSlot(
    slotId: string,
    doctorId: string,
    session: ClientSession,
  ): Promise<AppointmentSlotDocument> {
    // Atomic update: Only update if status is AVAILABLE
    const slot = await this.slotModel
      .findOneAndUpdate(
        {
          _id: new Types.ObjectId(slotId.toString()),
          doctorId: doctorId.toString(),
          status: SlotStatus.AVAILABLE, // Critical: only update if available
        },
        {
          $set: { status: SlotStatus.BOOKED },
        },
        {
          new: true,
          session,
        },
      )
      .exec();

    if (!slot) {
      // Slot not found or already booked
      const existingSlot = await this.slotModel
        .findById(slotId)
        .session(session)
        .exec();

      if (!existingSlot) {
        throw new NotFoundException(`Slot with ID ${slotId} not found`);
      }

      if (existingSlot.status !== SlotStatus.AVAILABLE) {
        throw new ConflictException(
          `Slot is not available. Current status: ${existingSlot.status}`,
        );
      }

      if (existingSlot.doctorId.toString() !== doctorId) {
        throw new BadRequestException(
          `Slot does not belong to doctor ${doctorId}`,
        );
      }
      this.logger.error({
        slotId,
        doctorId,
        existingStatus: existingSlot?.status,
        existingDoctorId: existingSlot?.doctorId?.toString(),
        expectedDoctorId: doctorId,
      });

      throw new ConflictException('Unable to reserve slot. Please try again.');
    }

    this.logger.debug(`Slot ${slotId} reserved successfully`);
    return slot;
  }

  /**
   * Validate no duplicate booking exists
   */
  private async validateNoDuplicateBooking(
    patientId: string,
    doctorId: string,
    bookingDate: Date,
    bookingTime: string,
    session: ClientSession,
  ): Promise<void> {
    const existingBooking = await this.bookingModel
      .findOne({
        patientId: new Types.ObjectId(patientId),
        doctorId: new Types.ObjectId(doctorId),
        bookingDate,
        bookingTime,
        status: { $in: [BookingStatus.PENDING, BookingStatus.CONFIRMED] },
      })
      .session(session)
      .exec();

    if (existingBooking) {
      throw new ConflictException(
        'You already have a booking with this doctor at this time',
      );
    }
  }

  /**
   * Validate ObjectIds
   */
  private validateObjectIds(dto: CreateBookingDto): void {
    if (!Types.ObjectId.isValid(dto.patientId)) {
      throw new BadRequestException('Invalid patient ID');
    }
    if (!Types.ObjectId.isValid(dto.doctorId)) {
      throw new BadRequestException('Invalid doctor ID');
    }
    if (!Types.ObjectId.isValid(dto.slotId)) {
      throw new BadRequestException('Invalid slot ID');
    }
  }

  /**
   * Publish booking created event to Kafka
   */
  // private async publishBookingCreatedEvent(
  //   booking: BookingDocument,
  //   patient: UserDocument,
  //   doctor: DoctorDocument,
  //   slot: AppointmentSlotDocument,
  // ): Promise<void> {
  //   const event = {
  //     eventType: 'BOOKING_CREATED',
  //     timestamp: new Date(),
  //     data: {
  //       bookingId: booking._id.toString(),
  //       patientId: patient._id.toString(),
  //       patientName: `${patient.firstName} ${patient.lastName}`,
  //       patientContact: patient.phoneNumber,
  //       doctorId: doctor._id.toString(),
  //       doctorName: `${doctor.firstName} ${doctor.middleName} ${doctor.lastName}`,
  //       slotId: slot._id.toString(),
  //       bookingDate: booking.bookingDate,
  //       bookingTime: booking.bookingTime,
  //       bookingEndTime: booking.bookingEndTime,
  //       location: booking.location,
  //       price: booking.price,
  //       status: booking.status,
  //     },
  //     metadata: {
  //       source: 'booking-service',
  //       version: '1.0',
  //     },
  //   };

  //   try {
  //     this.kafkaService.emit(KAFKA_TOPICS.BOOKING_CREATED, event);
  //     this.logger.log(`Booking created event published for ${booking._id}`);
  //   } catch (error) {
  //     this.logger.error(
  //       `Failed to publish booking created event: ${error.message}`,
  //       error.stack,
  //     );
  //     // Don't throw - event publishing failure shouldn't rollback booking
  //   }
  // }

  /**
   * Invalidate booking-related caches
   */
  private async invalidateBookingCaches(
    doctorId: string,
    patientId: string,
  ): Promise<void> {
    try {
      const cacheKeys = [
        `bookings:doctor:${doctorId}`,
        `bookings:patient:${patientId}`,
        `slots:available:${doctorId}`,
      ];

      await Promise.all(cacheKeys.map((key) => this.cacheService.del(key)));
    } catch (error) {
      const err = error as Error;
      this.logger.warn(`Failed to invalidate booking caches: ${err.message}`);
    }
  }

  /**
   * Map booking to response DTO
   */
  private mapToResponseDto(booking: BookingDocument): BookingResponseDto {
    return {
      bookingId: booking._id?.toString(),
      patientId: booking.patientId.toString(),
      doctorId: booking.doctorId.toString(),
      slotId: booking.slotId.toString(),
      status: booking.status,
      bookingDate: booking.bookingDate,
      bookingTime: booking.bookingTime,
      bookingEndTime: booking.bookingEndTime,
      location: booking.location,
      price: booking.price,
      createdBy: booking.createdBy,
      note: booking.note,
      createdAt: booking.createdAt,
    };
  }

  /**
   * Get patient's bookings
   */
  async getPatientBookings(
    patientId: string,
    status?: BookingStatus,
  ): Promise<BookingResponseDto[]> {
    if (!Types.ObjectId.isValid(patientId)) {
      throw new BadRequestException('Invalid patient ID');
    }

    const query: any = { patientId: new Types.ObjectId(patientId) };

    if (status) {
      query.status = status;
    }

    const bookings = await this.bookingModel
      .find(query)
      .sort({ bookingDate: -1, bookingTime: -1 })
      .populate('slotId')
      .populate('doctorId', 'firstName middleName lastName')
      .lean()
      .exec();

    return bookings.map((booking) => this.mapToResponseDto(booking as any));
  }

  /**
   * Cancel a booking
   */
  async cancelBooking(
    bookingId: string,
    cancelledBy: string,
    reason: string,
  ): Promise<BookingResponseDto> {
    if (!Types.ObjectId.isValid(bookingId)) {
      throw new BadRequestException('Invalid booking ID');
    }

    const session = await this.bookingModel.db.startSession();
    session.startTransaction();

    try {
      // Find and update booking
      const booking = await this.bookingModel
        .findOneAndUpdate(
          {
            _id: new Types.ObjectId(bookingId),
            status: { $in: [BookingStatus.PENDING, BookingStatus.CONFIRMED] },
          },
          {
            $set: {
              status: BookingStatus.CANCELLED_BY_DOCTOR,
              cancellation: {
                cancelledBy,
                reason,
                cancelledAt: new Date(),
              },
            },
          },
          { new: true, session },
        )
        .exec();

      if (!booking) {
        throw new NotFoundException(
          `Booking with ID ${bookingId} not found or already cancelled`,
        );
      }

      // Free up the slot
      await this.slotModel
        .findByIdAndUpdate(
          booking.slotId,
          { $set: { status: SlotStatus.AVAILABLE } },
          { session },
        )
        .exec();

      await session.commitTransaction();

      this.logger.log(`Booking ${bookingId} cancelled by ${cancelledBy}`);

      // Invalidate caches
      await this.invalidateBookingCaches(
        booking.doctorId.toString(),
        booking.patientId.toString(),
      );

      return this.mapToResponseDto(booking);
    } catch (error) {
      await session.abortTransaction();
      this.logger.error(`Failed to cancel booking: ${error.message}`);
      throw error;
    } finally {
      await session.endSession();
    }
  }
}
