import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
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
import { CacheService } from '@app/common/cache/cache.service';
import { BookingValidationService } from '@app/common/booking-validation';
import { invalidateBookingCaches } from '@app/common/utils/cache-invalidation.util';
import { KafkaService } from '@app/common/kafka/kafka.service';
import { KAFKA_TOPICS } from '@app/common/kafka/events/topics';

@Injectable()
export class BookingService {
  private readonly logger = new Logger(BookingService.name);

  constructor(
    @InjectModel(Booking.name) private bookingModel: Model<BookingDocument>,
    @InjectModel(AppointmentSlot.name)
    private slotModel: Model<AppointmentSlotDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Doctor.name) private doctorModel: Model<DoctorDocument>,
    private readonly cacheService: CacheService,
    private readonly patientBookingService: BookingValidationService,
    private readonly kafkaService: KafkaService,
  ) {}

  /**
   * Create a new booking with atomic slot reservation
   * Uses MongoDB transactions to ensure consistency
   */
  async createBooking(
    createBookingDto: CreateBookingDto,
    patientId: string,
  ): Promise<BookingResponseDto> {
    this.logger.log(
      `Creating booking for patient ${patientId}, slot ${createBookingDto.slotId}`,
    );

    // Validate IDs
    this.validateObjectIds(createBookingDto);

    // Get slot to determine booking date
    const slot = await this.slotModel.findById(createBookingDto.slotId).exec();
    if (!slot) {
      throw new NotFoundException('Slot not found');
    }

    // ✅ VALIDATE BOOKING RULES
    const validation = await this.patientBookingService.validateBooking(
      patientId,
      createBookingDto.doctorId,
      slot.date,
      slot._id.toString(),
    );

    if (!validation.canBook) {
      throw new ForbiddenException(validation.reason);
    }
    // Start a MongoDB session for transaction
    const session = await this.bookingModel.db.startSession();
    session.startTransaction();

    try {
      // Step 1: Validate patient exists
      const patient = await this.userModel
        .findById(patientId)
        .session(session)
        .exec();

      if (!patient) {
        throw new NotFoundException(`Patient with ID ${patientId} not found`);
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
        patientId,
        createBookingDto.doctorId,
        slot.date,
        slot.startTime,
        session,
      );

      // Step 5: Create the booking
      const booking = await this.bookingModel.create(
        [
          {
            patientId: new Types.ObjectId(patientId),
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

      // Step 6: Notify doctor via WhatsApp (after commit)
      this.publishBookingCreatedEvent(booking[0], patient, doctor);

      // Step 7: Invalidate cache
      await invalidateBookingCaches(
        this.cacheService,
        createBookingDto.doctorId,
        patientId,
        this.logger,
      );

      // Step 8: Return response
      return {
        success: true,
        message: `Booking created successfully: ${booking[0]._id.toString()}`,
      };
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
          doctorId: new Types.ObjectId(doctorId),
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
    if (!Types.ObjectId.isValid(dto.doctorId)) {
      throw new BadRequestException('Invalid doctor ID');
    }
    if (!Types.ObjectId.isValid(dto.slotId)) {
      throw new BadRequestException('Invalid slot ID');
    }
  }

  /**
   * Notify the doctor via WhatsApp when a patient books an appointment.
   * Uses the first normal phone on the doctor record (same pattern as WHATSAPP_DOCTOR_WELCOME).
   * Fire-and-forget: errors are logged but never thrown so the booking response is unaffected.
   */
  private publishBookingCreatedEvent(
    booking: BookingDocument,
    patient: UserDocument,
    doctor: DoctorDocument,
  ): void {
    const doctorPhone = doctor.phones?.[0]?.normal?.[0];
    if (!doctorPhone) {
      this.logger.warn(
        `Doctor ${doctor._id.toString()} has no normal phone. WhatsApp notification skipped.`,
      );
      return;
    }

    const appointmentDate =
      booking.bookingDate instanceof Date
        ? booking.bookingDate.toISOString().split('T')[0]
        : String(booking.bookingDate);

    try {
      this.kafkaService.emit(KAFKA_TOPICS.WHATSAPP_BOOKING_CREATED_DOCTOR, {
        phone: doctorPhone,
        doctorName: `${doctor.firstName} ${doctor.lastName}`,
        patientName: patient.username,
        appointmentDate,
        appointmentTime: booking.bookingTime,
      });
      this.logger.log(
        `📨 WhatsApp booking-created notification emitted for doctor ${doctor._id.toString()}`,
      );
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `Failed to emit WhatsApp booking-created notification: ${err.message}`,
        err.stack,
      );
    }
  }
}
