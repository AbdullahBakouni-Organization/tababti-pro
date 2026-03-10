import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  InternalServerErrorException,
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
} from '@app/common/database/schemas/common.enums';
import { CacheService } from '@app/common/cache/cache.service';
import {
  DoctorBookingDetailDto,
  GetDoctorBookingsDto,
  GetDoctorBookingsResponseDto,
} from './dto/get-doctor-booking.dto';
import { RescheduleBookingDto } from './dto/resechedula-booking.dto,';
import { KAFKA_TOPICS } from '@app/common/kafka/events/topics';
import { KafkaService } from '@app/common/kafka/kafka.service';
import {
  GalleryImage,
  GalleryImagesResponseDto,
  ProfileImageResponseDto,
} from './dto/images.dto';
import { MinioService, UploadResult } from '../minio/minio.service';
export interface GalleryImageWithStatus extends GalleryImage {
  status: GalleryImageStatus;
  imageId: string; // Unique ID for this image
  rejectionReason?: string;
  approvedAt?: Date;
  approvedBy?: string;
}
@Injectable()
export class DoctorBookingsQueryService {
  private readonly logger = new Logger(DoctorBookingsQueryService.name);
  private readonly CACHE_TTL = 300; // 5 minutes

  constructor(
    @InjectModel(Booking.name)
    private bookingModel: Model<BookingDocument>,
    @InjectModel(Doctor.name)
    private doctorModel: Model<DoctorDocument>,
    @InjectModel(AppointmentSlot.name)
    private slotModel: Model<AppointmentSlotDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private readonly cacheService: CacheService,
    private readonly kafkaProducer: KafkaService,
    private readonly minioService: MinioService,
  ) {}

  /**
   * Get doctor bookings with advanced filtering, sorting, and caching
   */
  async getDoctorBookings(
    dto: GetDoctorBookingsDto,
    doctorId: string,
  ): Promise<GetDoctorBookingsResponseDto> {
    this.logger.log(
      `Fetching bookings for doctor ${doctorId} with filters: ${JSON.stringify(dto)}`,
    );

    // Validate doctor ID
    if (!Types.ObjectId.isValid(doctorId)) {
      throw new BadRequestException('Invalid doctor ID');
    }

    // Generate cache key
    const cacheKey = this.generateCacheKey(dto, doctorId);

    // Try to get from cache
    const cachedResult =
      await this.cacheService.get<GetDoctorBookingsResponseDto>(cacheKey);

    if (cachedResult) {
      this.logger.debug(`Cache hit for key: ${cacheKey}`);
      return cachedResult;
    }

    this.logger.debug(`Cache miss for key: ${cacheKey}`);

    // Get doctor info (for inspection duration)
    const doctor = await this.doctorModel
      .findById(doctorId)
      .select('inspectionDuration firstName lastName')
      .lean()
      .exec();

    if (!doctor) {
      throw new BadRequestException('Doctor not found');
    }

    const inspectionDuration = doctor.inspectionDuration || 30; // Default 30 mins

    // Build query filters
    const filters = this.buildFilters(dto, doctorId);
    // Get total count for pagination
    const totalItems = await this.bookingModel.countDocuments(filters);

    // Calculate pagination
    const page = dto.page || 1;
    const limit = dto.limit || 20;
    const skip = (page - 1) * limit;
    const totalPages = Math.ceil(totalItems / limit);

    // Fetch bookings with all related data
    const bookings = await this.bookingModel
      .find(filters)
      .populate<{ patientId: User }>('patientId', 'username phone gender')
      .populate<{ slotId: AppointmentSlot }>(
        'slotId',
        'date startTime endTime status location',
      )
      .sort({ bookingTime: 1 }) // Sort by time (small to big)
      .skip(skip)
      .limit(limit)
      .lean()
      .exec();

    // Transform to DTOs
    const bookingDetails = this.transformBookings(bookings, inspectionDuration);

    // Calculate summary statistics
    const summary = await this.calculateSummary(doctorId, filters);

    // Build response
    const response: GetDoctorBookingsResponseDto = {
      bookings: bookingDetails,
      pagination: {
        currentPage: page,
        totalPages,
        totalItems,
        itemsPerPage: limit,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
      summary,
    };

    // Cache the result
    await this.cacheService.set(cacheKey, response, this.CACHE_TTL);

    this.logger.log(
      `Fetched ${bookingDetails.length} bookings (page ${page}/${totalPages})`,
    );

    return response;
  }

  /**
   * Build MongoDB query filters
   */
  private buildFilters(dto: GetDoctorBookingsDto, doctorId: string): any {
    const filters: any = {
      doctorId: new Types.ObjectId(doctorId),
    };

    // Date filters
    if (dto.date) {
      // Specific date
      const date = new Date(dto.date);
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      filters.bookingDate = {
        $gte: startOfDay,
        $lte: endOfDay,
      };
    } else if (dto.startDate || dto.endDate) {
      // Date range
      filters.bookingDate = {};

      if (dto.startDate) {
        const startDate = new Date(dto.startDate);
        startDate.setHours(0, 0, 0, 0);
        filters.bookingDate.$gte = startDate;
      }

      if (dto.endDate) {
        const endDate = new Date(dto.endDate);
        endDate.setHours(23, 59, 59, 999);
        filters.bookingDate.$lte = endDate;
      }
    }

    // Status filter (can be multiple)
    if (dto.status && dto.status.length > 0) {
      filters.status = { $in: dto.status };
    }

    // Location filters
    if (dto.locationType && dto.locationType.trim() !== '') {
      filters['location.type'] = dto.locationType;
    }
    // ✅ Location Entity Name filter
    if (dto.locationEntityName) {
      filters['location.entity_name'] = {
        $regex: dto.locationEntityName,
        $options: 'i', // case-insensitive
      };
    }

    return filters;
  }

  /**
   * Transform bookings to DTOs
   */
  private transformBookings(
    bookings: any[],
    inspectionDuration: number,
  ): DoctorBookingDetailDto[] {
    return bookings.map((booking) => {
      const patient = booking.patientId as User;
      const slot = booking.slotId as AppointmentSlot;

      return {
        bookingId: booking._id.toString(),
        status: booking.status,
        bookingDate: booking.bookingDate,
        bookingTime: booking.bookingTime,
        bookingEndTime: booking.bookingEndTime,
        inspectionDuration,
        price: booking.price,
        note: booking.note,
        createdAt: booking.createdAt,
        completedAt: booking.completedAt,
        cancellation: booking.cancellation
          ? {
              cancelledBy: booking.cancellation.cancelledBy,
              reason: booking.cancellation.reason,
              cancelledAt: booking.cancellation.cancelledAt,
            }
          : undefined,
        patient: {
          patientId: patient._id.toString(),
          username: patient.username,
          phone: patient.phone,
          gender: patient.gender,
        },
        slot: {
          slotId: slot._id.toString(),
          date: slot.date,
          startTime: slot.startTime,
          endTime: slot.endTime,
          status: slot.status,
          location: {
            type: slot.location.type,
            entity_name: slot.location.entity_name,
            address: slot.location.address,
          },
        },
      };
    });
  }

  /**
   * Calculate summary statistics
   */
  private async calculateSummary(
    doctorId: string,
    filters: any,
  ): Promise<{
    totalBookings: number;
    byStatus: { [key in BookingStatus]?: number };
    averageDuration: number;
    totalRevenue: number;
  }> {
    const doctor = await this.doctorModel
      .findById(doctorId)
      .select('inspectionDuration')
      .lean()
      .exec();

    const inspectionDuration = doctor?.inspectionDuration || 30;

    // Aggregate statistics
    const stats = await this.bookingModel.aggregate([
      { $match: filters },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalRevenue: { $sum: '$price' },
        },
      },
    ]);

    const byStatus: { [key in BookingStatus]?: number } = {};
    let totalBookings = 0;
    let totalRevenue = 0;

    stats.forEach((stat) => {
      byStatus[stat._id as BookingStatus] = stat.count;
      totalBookings += stat.count;
      totalRevenue += stat.totalRevenue;
    });
    return {
      totalBookings,
      byStatus,
      averageDuration: inspectionDuration,
      totalRevenue,
    };
  }

  /**
   * Generate cache key
   */
  private generateCacheKey(
    dto: GetDoctorBookingsDto,
    doctorId: string,
  ): string {
    const parts = [
      this.CACHE_PREFIX,
      doctorId,
      dto.date || 'all',
      dto.startDate || '',
      dto.endDate || '',
      dto.status?.join('-') || 'all',
      dto.locationEntityName || '',
      dto.locationType || '',
      `page${dto.page || 1}`,
      `limit${dto.limit || 20}`,
    ];

    return parts.filter(Boolean).join(':');
  }

  /**
   * Transform aggregated results to DTOs
   */
  private transformAggregatedBookings(
    results: any[],
    inspectionDuration: number,
  ): DoctorBookingDetailDto[] {
    return results.map((result) => ({
      bookingId: result._id.toString(),
      status: result.status,
      bookingDate: result.bookingDate,
      bookingTime: result.bookingTime,
      bookingEndTime: result.bookingEndTime,
      inspectionDuration,
      price: result.price,
      note: result.note,
      createdAt: result.createdAt,
      completedAt: result.completedAt,
      cancellation: result.cancellation,
      patient: {
        patientId: result.patientInfo._id.toString(),
        phone: result.patientInfo.phone,
        gender: result.patientInfo.gender,
      },
      slot: {
        slotId: result.slotInfo._id.toString(),
        date: result.slotInfo.date,
        startTime: result.slotInfo.startTime,
        endTime: result.slotInfo.endTime,
        status: result.slotInfo.status,
        location: result.slotInfo.location,
      },
    }));
  }

  /**
   * Invalidate cache for a doctor
   */
  async invalidateCache(doctorId: string): Promise<void> {
    const pattern = `${this.CACHE_PREFIX}:${doctorId}:*`;
    await this.cacheService.del(pattern);
    this.logger.log(`Cache invalidated for doctor ${doctorId}`);
  }

  async rescheduleBooking(
    doctorId: string,
    dto: RescheduleBookingDto,
  ): Promise<{ message: string }> {
    const booking = await this.bookingModel.findById(dto.bookingId).exec();

    if (!booking) throw new NotFoundException('Booking not found');

    // ✅ Ensure the booking belongs to this doctor
    if (booking.doctorId.toString() !== doctorId) {
      throw new ForbiddenException('This booking does not belong to you');
    }

    // ✅ Only PENDING or NEEDS_RESCHEDULE bookings can be rescheduled
    if (
      ![BookingStatus.PENDING, BookingStatus.RESCHEDULED].includes(
        booking.status,
      )
    ) {
      throw new BadRequestException(
        `Cannot reschedule a booking with status: ${booking.status}`,
      );
    }

    // ✅ Fetch patient for notification
    const patient = await this.userModel
      .findById(booking.patientId)
      .select('_id username fcmToken')
      .exec();

    if (!patient) throw new NotFoundException('Patient not found');

    // ✅ Fetch doctor name
    const doctor = await this.doctorModel
      .findById(doctorId)
      .select('firstName lastName')
      .exec();

    if (!doctor) throw new NotFoundException('Doctor not found');

    const doctorName = `${doctor.firstName} ${doctor.lastName}`;

    // ✅ Free the slot
    await this.slotModel.updateOne(
      { _id: booking.slotId },
      {
        $set: {
          status: SlotStatus.AVAILABLE,
          patientId: null,
          bookingId: null,
          bookedAt: null,
        },
      },
    );

    // ✅ Update booking status
    await this.bookingModel.updateOne(
      { _id: booking._id },
      {
        $set: {
          status: BookingStatus.RESCHEDULED,
          cancellation: {
            cancelledBy: 'DOCTOR',
            reason: 'Doctor Rescheduled',
            cancelledAt: new Date(),
          },
        },
      },
    );

    // ✅ Send Kafka notification to patient
    this.sendReschueledNotification(
      doctorId,
      doctorName,
      patient,
      booking,
      'Doctor Rescheduled your last appointment because you missed the previous appointment',
      'BOOKING_RESCHEDULED',
    );

    this.logger.log(
      `✅ Booking ${dto.bookingId} marked as RESCHEDULED by doctor ${doctorId}`,
    );

    return {
      message: 'Booking marked as rescheduled and slot is now available',
    };
  }

  private sendReschueledNotification(
    doctorId: string,
    doctorName: string,
    patient: UserDocument,
    booking: BookingDocument,
    reason: string,
    type: 'BOOKING_RESCHEDULED',
  ): boolean {
    if (!patient.fcmToken) {
      this.logger.warn(`Patient has no FCM token. Notification not sent.`);
      return false;
    }

    if (!booking._id) {
      this.logger.error(
        `Booking document is missing _id. Cancellation notification not sent.`,
      );
      return false;
    }

    const event = {
      eventType: 'BOOKING_RESCHEDULED_NOTIFICATION',
      timestamp: new Date(),
      data: {
        patientId: patient._id.toString(),
        patientName: patient.username,
        doctorId,
        doctorName,
        fcmToken: patient.fcmToken,
        bookingId: booking._id.toString(),
        appointmentDate: booking.bookingDate,
        appointmentTime: booking.bookingTime,
        reason,
        type,
      },
      metadata: {
        source: 'doctor-service',
        version: '1.0',
      },
    };

    try {
      this.kafkaProducer.emit(
        KAFKA_TOPICS.BOOKING_RESCHEDULED_NOTIFICATION,
        event,
      );
      this.logger.log(
        `📱 Rescheduled notification event published for patient ${patient._id.toString()}`,
      );
      return true;
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `Failed to publish cancellation notification: ${err.message}`,
      );
      return false;
    }
  }
}
