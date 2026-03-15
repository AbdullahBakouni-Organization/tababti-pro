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
  GalleryImageStatus,
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
import { uploadDoctorProfileImage } from '@app/common/utils/upload-profile-images.util';
import { Post } from '@app/common/database/schemas/post.schema';
import { SearchDoctorsDto } from './dto/search-of-another-doctor.dto';
import {
  invalidateBookingCaches,
  invalidateProfileCaches,
} from '@app/common/utils/cache-invalidation.util';
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
  private readonly CACHE_TTL = 120; // 2 minutes
  private readonly CACHE_TTL_REVALIDATE = 900; // 15 minutes
  private readonly CACHE_PREFIX = 'doctor:bookings';
  private readonly MAX_GALLERY_IMAGES = 20;

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
    @InjectModel(Post.name) private readonly postModel: Model<Post>,
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

    const inspectionDuration = doctor.inspectionDuration || 0; // Default 0 mins

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
    await this.cacheService.set(
      cacheKey,
      response,
      this.CACHE_TTL,
      this.CACHE_TTL_REVALIDATE,
    );

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
    await invalidateBookingCaches(
      this.cacheService,
      patient._id.toString(),
      doctorId,
      this.logger,
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

  /**
   * Upload or update doctor profile image
   * If image exists, it will be replaced
   */
  async uploadProfileImage(
    doctorId: string,
    file: Express.Multer.File,
  ): Promise<ProfileImageResponseDto> {
    this.logger.log(`Uploading profile image for doctor ${doctorId}`);

    // Validate doctor ID
    if (!Types.ObjectId.isValid(doctorId)) {
      throw new BadRequestException('Invalid doctor ID');
    }

    // Get doctor
    const doctor = await this.doctorModel.findById(doctorId).exec();
    if (!doctor) {
      throw new NotFoundException('Doctor not found');
    }

    let previousImageUrl: string | undefined;

    // Delete old profile image if exists
    if (doctor.image && doctor.imageFileName && doctor.imageBucket) {
      previousImageUrl = doctor.image;

      try {
        await this.minioService.deleteFile(
          doctor.imageBucket,
          doctor.imageFileName,
        );
        this.logger.log(
          `Previous profile image deleted for doctor ${doctorId}`,
        );
      } catch (error) {
        const err = error as Error;
        this.logger.warn(`Failed to delete old profile image: ${err.message}`);
        // Continue with upload even if deletion fails
      }
    }

    // Upload new profile image to MinIO
    const uploadResult = await uploadDoctorProfileImage(
      this.minioService,
      doctorId,
      file,
    );
    if (!uploadResult) {
      throw new Error('Failed to upload profile image');
    }

    // Update doctor record
    doctor.image = uploadResult.url;
    doctor.imageFileName = uploadResult.fileName;
    doctor.imageBucket = uploadResult.bucket;
    await doctor.save();
    await invalidateProfileCaches(this.cacheService, doctorId, this.logger);
    this.logger.log(
      `Profile image uploaded successfully for doctor ${doctorId}`,
    );

    return {
      success: true,
      message: previousImageUrl
        ? 'Profile image updated successfully'
        : 'Profile image uploaded successfully',
      doctorId,
      imageUrl: uploadResult.url,
      previousImageUrl,
    };
  }

  /**
   * Add images to doctor gallery
   * Can upload single or multiple images
   */
  // async addGalleryImages(
  //   doctorId: string,
  //   files: Express.Multer.File[],
  //   description?: string,
  // ): Promise<GalleryImagesResponseDto> {
  //   this.logger.log(
  //     `Adding ${files.length} images to gallery for doctor ${doctorId}`,
  //   );

  //   // Validate doctor ID
  //   if (!Types.ObjectId.isValid(doctorId)) {
  //     throw new BadRequestException('Invalid doctor ID');
  //   }

  //   // Validate files array
  //   if (!files || files.length === 0) {
  //     throw new BadRequestException('No images provided');
  //   }

  //   // Get doctor
  //   const doctor = await this.doctorModel.findById(doctorId).exec();
  //   if (!doctor) {
  //     throw new NotFoundException('Doctor not found');
  //   }

  //   // Check gallery limit
  //   const currentGalleryCount = doctor.gallery?.length || 0;
  //   const newImagesCount = files.length;
  //   const totalAfterUpload = currentGalleryCount + newImagesCount;

  //   if (totalAfterUpload > this.MAX_GALLERY_IMAGES) {
  //     throw new BadRequestException(
  //       `Gallery limit exceeded. Maximum ${this.MAX_GALLERY_IMAGES} images allowed. ` +
  //         `Current: ${currentGalleryCount}, Trying to add: ${newImagesCount}`,
  //     );
  //   }

  //   // Upload all images to MinIO
  //   const uploadedImages: GalleryImage[] = [];
  //   const uploadedUrls: string[] = [];

  //   for (const file of files) {
  //     try {
  //       const uploadResult = await this.uploadDoctorGalleryImage(
  //         doctorId,
  //         file,
  //       );

  //       const galleryImage: GalleryImage = {
  //         url: uploadResult.url,
  //         fileName: uploadResult.fileName,
  //         bucket: uploadResult.bucket,
  //         description,
  //         uploadedAt: new Date(),
  //       };

  //       uploadedImages.push(galleryImage);
  //       uploadedUrls.push(uploadResult.url);
  //     } catch (error) {
  //       const err = error as Error;
  //       this.logger.error(
  //         `Failed to upload gallery image: ${err.message}`,
  //         err.stack,
  //       );

  //       // Cleanup: delete already uploaded images
  //       await this.cleanupUploadedImages(uploadedImages);

  //       throw new InternalServerErrorException(
  //         `Failed to upload images. Error: ${err.message}`,
  //       );
  //     }
  //   }

  //   // Update doctor record with new gallery images
  //   if (!doctor.gallery) {
  //     doctor.gallery = [];
  //   }

  //   doctor.gallery.push(...uploadedImages);
  //   await doctor.save();

  //   this.logger.log(
  //     `${files.length} images added to gallery for doctor ${doctorId}`,
  //   );

  //   return {
  //     success: true,
  //     message: `${files.length} image(s) added to gallery successfully`,
  //     doctorId,
  //     uploadedCount: files.length,
  //     totalGalleryImages: doctor.gallery.length,
  //     uploadedImages: uploadedUrls,
  //   };
  // }
  //
  async addGalleryImages(
    doctorId: string,
    files: Express.Multer.File[],
    description?: string,
  ): Promise<GalleryImagesResponseDto> {
    this.logger.log(
      `Adding ${files.length} images to gallery for doctor ${doctorId}`,
    );

    if (!Types.ObjectId.isValid(doctorId)) {
      throw new BadRequestException('Invalid doctor ID');
    }

    if (!files || files.length === 0) {
      throw new BadRequestException('No images provided');
    }

    const doctor = await this.doctorModel.findById(doctorId).exec();
    if (!doctor) {
      throw new NotFoundException('Doctor not found');
    }

    // Check gallery limit (including pending images)
    const currentGalleryCount = doctor.gallery?.length || 0;
    const totalAfterUpload = currentGalleryCount + files.length;

    if (totalAfterUpload > this.MAX_GALLERY_IMAGES) {
      throw new BadRequestException(
        `Gallery limit exceeded. Maximum ${this.MAX_GALLERY_IMAGES} images allowed.`,
      );
    }

    // Upload all images to MinIO
    const uploadedImages: GalleryImageWithStatus[] = [];
    const uploadedUrls: string[] = [];

    for (const file of files) {
      try {
        const uploadResult = await this.uploadDoctorGalleryImage(
          doctorId,
          file,
        );

        const galleryImage: GalleryImageWithStatus = {
          imageId: new Types.ObjectId().toString(), // Unique ID for this image
          url: uploadResult.url,
          fileName: uploadResult.fileName,
          bucket: uploadResult.bucket,
          description,
          uploadedAt: new Date(),
          status: GalleryImageStatus.PENDING, // ✅ Set as PENDING
        };

        uploadedImages.push(galleryImage);
        uploadedUrls.push(uploadResult.url);
        await invalidateProfileCaches(this.cacheService, doctorId, this.logger);
      } catch (error) {
        const err = error as Error;
        this.logger.error(`Failed to upload gallery image: ${err.message}`);
        await this.cleanupUploadedImages(uploadedImages);
        throw new InternalServerErrorException('Failed to upload images');
      }
    }

    // Add to gallery with PENDING status
    if (!doctor.gallery) {
      doctor.gallery = [];
    }

    doctor.gallery.push(...uploadedImages);
    await doctor.save();
    await invalidateProfileCaches(this.cacheService, doctorId, this.logger);
    this.logger.log(
      `${files.length} images added to gallery (PENDING approval)`,
    );

    return {
      success: true,
      message: `${files.length} image(s) uploaded successfully. Awaiting admin approval.`,
      doctorId,
      uploadedCount: files.length,
      totalGalleryImages: doctor.gallery.length,
      uploadedImages: uploadedUrls,
    };
  }

  /**
   * Upload doctor gallery image to MinIO
   */
  private async uploadDoctorGalleryImage(
    doctorId: string,
    file: Express.Multer.File,
  ): Promise<UploadResult> {
    const folder = `doctors/${doctorId}/gallery`;
    return this.minioService.uploadFile(file, 'doctors', folder);
  }

  /**
   * Cleanup uploaded images on error
   */
  private async cleanupUploadedImages(images: GalleryImage[]): Promise<void> {
    this.logger.log(`Cleaning up ${images.length} uploaded images`);

    for (const image of images) {
      try {
        await this.minioService.deleteFile(image.bucket, image.fileName);
      } catch (error) {
        const err = error as Error;
        this.logger.warn(
          `Failed to cleanup image ${image.fileName}: ${err.message}`,
        );
      }
    }
  }

  async deleteGalleryImage(doctorId: string, imageUrl: string): Promise<void> {
    this.logger.log(`Deleting gallery image for doctor ${doctorId}`);

    if (!Types.ObjectId.isValid(doctorId)) {
      throw new BadRequestException('Invalid doctor ID');
    }

    const doctor = await this.doctorModel.findById(doctorId).exec();
    if (!doctor) {
      throw new NotFoundException('Doctor not found');
    }

    if (!doctor.gallery || doctor.gallery.length === 0) {
      throw new BadRequestException('Gallery is empty');
    }

    // Find image in gallery
    const imageIndex = doctor.gallery.findIndex((img) => img.url === imageUrl);
    if (imageIndex === -1) {
      throw new NotFoundException('Image not found in gallery');
    }

    const imageToDelete = doctor.gallery[imageIndex];

    // Delete from MinIO
    try {
      await this.minioService.deleteFile(
        imageToDelete.bucket,
        imageToDelete.fileName,
      );
    } catch (error) {
      const err = error as Error;
      this.logger.warn(`Failed to delete image from MinIO: ${err.message}`);
    }

    // Remove from gallery array
    doctor.gallery.splice(imageIndex, 1);
    await doctor.save();
    await invalidateProfileCaches(this.cacheService, doctorId, this.logger);
    this.logger.log(`Gallery image deleted for doctor ${doctorId}`);
  }

  async getDoctorGalleryImages(
    doctorId: string,
    page = 1,
  ): Promise<{ gallery: GalleryImageWithStatus[]; galleryCount: number }> {
    if (!Types.ObjectId.isValid(doctorId)) {
      throw new BadRequestException('Invalid doctor ID');
    }

    const cacheKey = `doctor:gallery:${doctorId}`;

    // Try cache first
    const cached = await this.cacheService.get<{
      gallery: GalleryImageWithStatus[];
      galleryCount: number;
    }>(cacheKey);

    if (cached) {
      this.logger.debug(`Gallery cache hit: ${cacheKey}`);
      return cached;
    }

    this.logger.debug(`Gallery cache miss: ${cacheKey}`);

    const doctor = await this.doctorModel
      .findById(doctorId)
      .select('gallery')
      .lean()
      .exec();

    if (!doctor) {
      throw new NotFoundException('Doctor not found');
    }

    const approvedGallery =
      doctor.gallery?.filter(
        (img) => img.status === GalleryImageStatus.APPROVED,
      ) || [];

    const result = {
      gallery: approvedGallery,
      galleryCount: approvedGallery.length,
    };

    // Save to cache (TTL = 2 hours)
    await this.cacheService.set(cacheKey, result, 3600, 7200);

    return result;
  }

  async getDoctorPosts(doctorId: string, page = 1) {
    const limit = 10;
    const skip = (page - 1) * limit;

    const cacheKey = `doctor:posts:${doctorId}:page${page}:limit${limit}`;

    // Try cache first
    const cached = await this.cacheService.get<{
      posts: any[];
      pagination: {
        page: number;
        limit: number;
        totalPosts: number;
        totalPages: number;
      };
    }>(cacheKey);

    if (cached) {
      this.logger.debug(`Posts cache hit: ${cacheKey}`);
      return cached;
    }

    this.logger.debug(`Posts cache miss: ${cacheKey}`);

    const [posts, totalPosts] = await Promise.all([
      this.postModel
        .find({ authorId: new Types.ObjectId(doctorId), authorType: 'doctor' })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),

      this.postModel.countDocuments({
        authorId: doctorId,
        authorType: 'doctor',
      }),
    ]);

    const totalPages = Math.ceil(totalPosts / limit);

    const result = {
      posts,
      pagination: {
        page,
        limit,
        totalPosts,
        totalPages,
      },
    };

    // Save to cache (TTL = 2 hours)
    await this.cacheService.set(cacheKey, result, 3600, 7200);

    return result;
  }

  // doctors.service.ts
  async searchDoctorsByName(dto: SearchDoctorsDto) {
    const page = parseInt(dto.page ?? '1');
    const limit = parseInt(dto.limit ?? '10');
    const skip = (page - 1) * limit;

    // Powerful regex: trims, escapes special chars, supports arabic + english
    // splits by space so "احمد علي" matches firstName+middleName+lastName in any order
    const escapedName = dto.name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // escape regex special chars

    const nameParts = escapedName.split(/\s+/).filter(Boolean);

    // Each word must match at least one of the name fields
    const nameConditions = nameParts.map((part) => ({
      $or: [
        { firstName: { $regex: part, $options: 'i' } },
        { middleName: { $regex: part, $options: 'i' } },
        { lastName: { $regex: part, $options: 'i' } },
      ],
    }));

    const query = { $and: nameConditions };

    const [doctors, total] = await Promise.all([
      this.doctorModel
        .find(query)
        .select(
          'firstName middleName lastName image publicSpecialization privateSpecialization',
        )
        .skip(skip)
        .limit(limit)
        .lean(),
      this.doctorModel.countDocuments(query),
    ]);

    const data = doctors.map((doctor) => {
      return {
        id: doctor._id,
        fullName: [doctor.firstName, doctor.middleName, doctor.lastName]
          .filter(Boolean)
          .join(' '),
        image: doctor.image ?? null,
        publicSpecialization: doctor.publicSpecialization,
        privateSpecialization: doctor.privateSpecialization,
      };
    });

    return {
      doctors: {
        data,
        metadata: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
          hasNextPage: skip + doctors.length < total,
        },
      },
    };
  }
}
