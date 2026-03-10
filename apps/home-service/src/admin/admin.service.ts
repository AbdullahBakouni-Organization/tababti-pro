import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import {
  Admin,
  AdminDocument,
} from '@app/common/database/schemas/admin.schema';
import {
  Doctor,
  DoctorDocument,
} from '@app/common/database/schemas/doctor.schema';
import { Hospital } from '@app/common/database/schemas/hospital.schema';
import { Center } from '@app/common/database/schemas/center.schema';
import { AuthAccount } from '@app/common/database/schemas/auth.schema';

import { AdminSignInDto } from './dto/admin-signin.dto';
import {
  ApprovalStatus,
  GalleryImageStatus,
  PostStatus,
} from '@app/common/database/schemas/common.enums';
import { KAFKA_TOPICS } from '@app/common/kafka/events/topics';
import { KafkaService } from '@app/common/kafka/kafka.service';
import { Post } from '@app/common/database/schemas/post.schema';
import { MinioService } from '../minio/minio.service';
import { GalleryImageWithStatus } from '../doctor/doctor.service.v2';
import {
  ApprovePostDto,
  GetPostsFilterDto,
  PaginatedPostsResponseDto,
  PostActionResponseDto,
  PostWithDoctorDto,
  RejectPostDto,
} from './dto/approved-reject-post.dto';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);
  constructor(
    @InjectModel(Admin.name) private adminModel: Model<AdminDocument>,
    @InjectModel(Doctor.name) private doctorModel: Model<Doctor>,
    @InjectModel(Post.name) private readonly postModel: Model<Post>,
    @InjectModel(Hospital.name) private hospitalModel: Model<Hospital>,
    @InjectModel(Center.name) private centerModel: Model<Center>,
    @InjectModel(AuthAccount.name) private authAccountModel: Model<AuthAccount>,
    private kafkaProducer: KafkaService,
    private readonly minioService: MinioService,
  ) {}

  // Admin Sign In
  async signIn(dto: AdminSignInDto): Promise<AdminDocument> {
    const session = await this.adminModel.db.startSession();

    try {
      session.startTransaction();

      const admin = await this.adminModel.findOne({
        username: dto.username,
        phone: dto.phone,
      });

      if (!admin) {
        throw new UnauthorizedException('Invalid credentials');
      }
      if (admin.lockedUntil && admin.lockedUntil.getTime() > Date.now()) {
        const unlockDate = admin.lockedUntil.toLocaleString('ar-SY', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });

        throw new UnauthorizedException(
          `تم قفل الحساب بسبب محاولات تسجيل دخول فاشلة. سيتم فتح الحساب في: ${unlockDate}`,
        );
      }

      // Compare password
      const isPasswordValid = await bcrypt.compare(
        dto.password,
        admin.password,
      );

      if (!isPasswordValid) {
        // Increment and save failed attempts
        admin.incrementFailedAttempts?.();
        await admin.save({ session });
        await session.commitTransaction();

        // Throw error AFTER committing
        throw new UnauthorizedException('رقم الهاتف أو كلمة مرور غير صحيحة');
      }
      const activeSessionsCount = admin.getActiveSessionsCount?.();
      const maxSessions = admin.maxSessions || 5;

      if (activeSessionsCount && activeSessionsCount >= maxSessions) {
        await admin.save({ session });
        await session.commitTransaction();
        throw new UnauthorizedException(
          `لقد تجاوزت الحد الأقصى للجلسات النشطة (${maxSessions} ${maxSessions === 1 ? 'جلسة' : 'جلسات'}). يرجى تسجيل الخروج من جهاز آخر أولاً`,
        );
      }
      if (!admin.isActive) {
        throw new UnauthorizedException('Admin account is deactivated');
      }
      await this.authAccountModel.findByIdAndUpdate(admin.authAccountId, {
        lastLoginAt: new Date(),
      });

      admin.lastLoginAt = new Date();
      await admin.save({ session });
      await session.commitTransaction();

      return admin;
    } catch (error) {
      // Only abort if we haven't committed yet
      if (session.inTransaction()) {
        await session.abortTransaction();
      }
      throw error;
    } finally {
      await session.endSession();
    }
  }

  async approveDoctor(
    doctorId: string,
    adminId: string,
  ): Promise<DoctorDocument> {
    const session = await this.doctorModel.db.startSession();

    let approvedDoctor: DoctorDocument;

    try {
      session.startTransaction();

      // 🔒 DB section only
      const doctor = await this.doctorModel.findById(doctorId).session(session);

      if (!doctor) {
        throw new BadRequestException('Doctor not found');
      }

      if (doctor.status !== ApprovalStatus.PENDING) {
        throw new BadRequestException(
          `Doctor is not pending. Current status: ${doctor.status}`,
        );
      }

      if (!doctor.authAccountId) {
        throw new BadRequestException('Doctor does not have auth account');
      }

      // 2️⃣ Extract normalized phones
      const normalizedPhones = [
        ...new Set(
          (doctor.phones ?? [])
            .flatMap((p) => p.normal ?? [])
            .map((p) => p.trim())
            .filter(Boolean),
        ),
      ];

      if (normalizedPhones.length === 0) {
        throw new BadRequestException('Doctor has no normalized phone numbers');
      }
      const existing = await this.authAccountModel
        .findOne({ phones: { $in: normalizedPhones } })
        .session(session);

      if (existing) {
        existing.isActive = true;

        // 2. Save the changes to the database (pass the session!)
        await existing.save({ session });
      }

      doctor.status = ApprovalStatus.APPROVED;
      doctor.approvedBy = adminId as any;
      doctor.approvedAt = new Date();

      approvedDoctor = await doctor.save({ session });

      await session.commitTransaction();
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      await session.endSession();
    }

    // ───────────────────────────────────────────────
    // 🔔 SIDE EFFECTS (OUTSIDE TRANSACTION)
    // ───────────────────────────────────────────────

    try {
      const results = await Promise.allSettled([
        this.publishDoctorApprovedEvent(approvedDoctor),
      ]);

      results.forEach((r, idx) => {
        if (r.status === 'rejected') {
          this.logger.error(
            `Post-commit side effect #${idx + 1} failed`,
            r.reason,
          );
        }
      });
    } catch (error) {
      // ⚠️ This catch is only for unexpected Promise.allSettled failures
      this.logger.error(
        'Unexpected error during post-commit side effects',
        error,
      );
    }

    return approvedDoctor;
  }

  async rejectedDoctor(
    doctorId: string,
    adminId: string,
    reason: string,
  ): Promise<DoctorDocument> {
    const session = await this.doctorModel.db.startSession();

    let rejectedDoctor: DoctorDocument;

    try {
      session.startTransaction();

      // 🔒 DB section only
      const doctor = await this.doctorModel.findById(doctorId).session(session);

      if (!doctor) {
        throw new BadRequestException('Doctor not found');
      }

      if (doctor.status !== ApprovalStatus.PENDING) {
        throw new BadRequestException(
          `Doctor is not pending. Current status: ${doctor.status}`,
        );
      }

      // 2️⃣ Extract normalized phones
      const normalizedPhones = [
        ...new Set(
          (doctor.phones ?? [])
            .flatMap((p) => p.normal ?? [])
            .map((p) => p.trim())
            .filter(Boolean),
        ),
      ];

      if (normalizedPhones.length === 0) {
        throw new BadRequestException('Doctor has no normalized phone numbers');
      }

      doctor.status = ApprovalStatus.REJECTED;
      doctor.rejectedBy = adminId as any;
      doctor.rejectedAt = new Date();

      rejectedDoctor = await doctor.save({ session });

      await session.commitTransaction();
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      await session.endSession();
    }

    // ───────────────────────────────────────────────
    // 🔔 SIDE EFFECTS (OUTSIDE TRANSACTION)
    // ───────────────────────────────────────────────

    try {
      const results = await Promise.allSettled([
        this.publishDoctorRejectedEvent(rejectedDoctor, reason),
      ]);

      results.forEach((r, idx) => {
        if (r.status === 'rejected') {
          this.logger.error(
            `Post-commit side effect #${idx + 1} failed`,
            r.reason,
          );
        }
      });
    } catch (error) {
      // ⚠️ This catch is only for unexpected Promise.allSettled failures
      this.logger.error(
        'Unexpected error during post-commit side effects',
        error,
      );
    }

    return rejectedDoctor;
  }

  private async publishDoctorApprovedEvent(
    doctor: DoctorDocument,
  ): Promise<void> {
    const event = {
      eventType: 'DOCTOR_APPROVED',
      timestamp: new Date(),
      data: {
        doctorId: doctor._id.toString(),
        fullName: `${doctor.firstName} ${doctor.middleName} ${doctor.lastName}`,
        phone: doctor.phones
          .map((p) => p.normal || p.clinic || p.whatsup)
          .flat()
          .join(', '),
      },
      metadata: {
        source: 'approved-service',
        version: '1.0',
      },
    };

    try {
      // Use emit for fire-and-forget events
      await this.kafkaProducer.emit(KAFKA_TOPICS.DOCTOR_APPROVED, event);
    } catch (error) {
      const err = new Error(
        `Failed to publish Approved event: ${error.message}`,
      );
      this.logger.error(err.message);
    }
  }

  private async publishDoctorRejectedEvent(
    doctor: DoctorDocument,
    reason: string,
  ): Promise<void> {
    const event = {
      eventType: 'DOCTOR_REJECTED',
      timestamp: new Date(),
      data: {
        doctorId: doctor._id.toString(),
        fullName: `${doctor.firstName} ${doctor.middleName} ${doctor.lastName}`,
        phone: doctor.phones
          .map((p) => p.normal || p.clinic || p.whatsup)
          .flat()
          .join(', '),
        reason,
      },
      metadata: {
        source: 'rejected-service',
        version: '1.0',
      },
    };

    try {
      // Use emit for fire-and-forget events
      await this.kafkaProducer.emit(KAFKA_TOPICS.DOCTOR_REJECTED, event);
    } catch (error) {
      const err = new Error(
        `Failed to publish Rejected event: ${error.message}`,
      );
      this.logger.error(err.message);
    }
  }

  async updatePostStatus(postId: string, status: PostStatus, adminId: string) {
    if (!Types.ObjectId.isValid(postId)) {
      throw new NotFoundException('post.INVALID_ID');
    }

    const validStatuses = [
      PostStatus.PENDING,
      PostStatus.APPROVED,
      PostStatus.REJECTED,
      PostStatus.PUBLISHED,
      PostStatus.DELETED,
    ];

    if (!validStatuses.includes(status)) {
      throw new BadRequestException('post.INVALID_STATUS');
    }

    const updated = await this.postModel.findByIdAndUpdate(
      postId,
      {
        $set: {
          status,
          updatedAt: new Date(),
        },
      },
      { new: true },
    );

    if (!updated) {
      throw new NotFoundException('post.NOT_FOUND');
    }

    return updated;
  }

  async approveGalleryImages(
    doctorId: string,
    imageIds: string[],
    adminId: string,
  ): Promise<void> {
    this.logger.log(
      `Admin ${adminId} approving ${imageIds.length} images for doctor ${doctorId}`,
    );

    if (!Types.ObjectId.isValid(doctorId)) {
      throw new BadRequestException('Invalid doctor ID');
    }

    const result = await this.doctorModel.updateOne(
      { _id: doctorId },
      {
        $set: {
          'gallery.$[img].status': GalleryImageStatus.APPROVED,
          'gallery.$[img].approvedAt': new Date(),
          'gallery.$[img].approvedBy': adminId,
        },
      },
      {
        arrayFilters: [
          {
            'img.imageId': { $in: imageIds },
            'img.status': { $ne: GalleryImageStatus.APPROVED },
          },
        ],
      },
    );

    if (result.matchedCount === 0) {
      throw new NotFoundException('Doctor not found');
    }

    if (result.modifiedCount === 0) {
      throw new BadRequestException('No images were approved');
    }

    this.logger.log(`${result.modifiedCount} images approved`);
  }

  /**
   * Admin rejects gallery image and deletes from MinIO
   */
  async rejectGalleryImages(
    doctorId: string,
    imageIds: string[],
    reason: string,
  ): Promise<void> {
    this.logger.log(
      `Rejecting ${imageIds.length} images for doctor ${doctorId}`,
    );

    if (!Types.ObjectId.isValid(doctorId)) {
      throw new BadRequestException('Invalid doctor ID');
    }

    const doctor = await this.doctorModel
      .findOne(
        { _id: doctorId },
        { gallery: { $elemMatch: { imageId: { $in: imageIds } } } },
      )
      .lean();

    if (!doctor) {
      throw new NotFoundException('Doctor not found');
    }

    const imagesToDelete =
      doctor.gallery?.filter((img) => imageIds.includes(img.imageId)) || [];

    if (!imagesToDelete.length) {
      throw new NotFoundException('Images not found');
    }

    for (const image of imagesToDelete) {
      try {
        await this.minioService.deleteFile(image.bucket, image.fileName);

        this.logger.log(`Deleted from MinIO: ${image.fileName}`);
      } catch (error) {
        const err = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Failed deleting ${image.fileName}: ${err}`);
      }
    }

    await this.doctorModel.updateOne(
      { _id: doctorId },
      {
        $pull: {
          gallery: {
            imageId: { $in: imageIds },
          },
        },
      },
    );

    this.logger.log(`${imagesToDelete.length} images rejected and removed`);
  }

  /**
   * Get gallery images filtered by status
   */
  async getGalleryImages(
    doctorId: string,
    status?: GalleryImageStatus,
  ): Promise<GalleryImageWithStatus[]> {
    if (!Types.ObjectId.isValid(doctorId)) {
      throw new BadRequestException('Invalid doctor ID');
    }

    const doctor = await this.doctorModel
      .findById(doctorId)
      .select('gallery')
      .exec();

    if (!doctor) {
      throw new NotFoundException('Doctor not found');
    }

    let images = doctor.gallery || [];

    // Filter by status if provided
    if (status) {
      images = images.filter((img) => img.status === status);
    }

    return images;
  }

  async approvePost(
    postId: string,
    dto: ApprovePostDto,
    adminId: string,
  ): Promise<PostActionResponseDto> {
    this.logger.log(`Approving post ${postId} by admin ${adminId}`);

    if (!Types.ObjectId.isValid(postId)) {
      throw new BadRequestException('Invalid post ID');
    }

    // Find post with doctor info
    const post = await this.postModel
      .findOne({
        _id: new Types.ObjectId(postId),
        status: PostStatus.PENDING,
      })
      .exec();

    if (!post) {
      throw new NotFoundException('Post not found or already processed');
    }

    // Get doctor
    const doctor = await this.doctorModel.findById(post.authorId).exec();
    if (!doctor) {
      throw new NotFoundException('Doctor not found');
    }

    // Update post status
    post.status = PostStatus.APPROVED;
    post.approvedAt = new Date();
    post.approvedBy = adminId;
    post.updatedAt = new Date();
    await post.save();

    this.logger.log(`Post ${postId} approved successfully`);

    // Send Kafka notification to doctor
    this.sendDoctorApprovedPost(doctor, postId);

    const doctorName = `${doctor.firstName} ${doctor.lastName}`;

    return {
      success: true,
      message: 'Post approved successfully',
      postId,
      doctorId: doctor._id.toString(),
      doctorName,
      status: PostStatus.APPROVED,
      actionAt: new Date(),
      adminId,
      doctorNotified: !!doctor.fcmToken,
    };
  }

  /**
   * Reject post and send notification to doctor
   */
  async rejectPost(
    postId: string,
    dto: RejectPostDto,
    adminId: string,
  ): Promise<PostActionResponseDto> {
    this.logger.log(`Rejecting post ${postId} by admin ${adminId}`);

    if (!Types.ObjectId.isValid(postId)) {
      throw new BadRequestException('Invalid post ID');
    }

    // Find post with doctor info
    const post = await this.postModel
      .findOne({
        _id: new Types.ObjectId(postId),
        status: PostStatus.PENDING,
      })
      .exec();

    if (!post) {
      throw new NotFoundException('Post not found or already processed');
    }

    // Get doctor
    const doctor = await this.doctorModel.findById(post.authorId).exec();
    if (!doctor) {
      throw new NotFoundException('Doctor not found');
    }

    // Update post status
    post.status = PostStatus.REJECTED;
    post.rejectedAt = new Date();
    post.rejectedBy = adminId;
    post.rejectionReason = dto.reason;
    post.updatedAt = new Date();
    await post.save();

    this.logger.log(`Post ${postId} rejected successfully`);

    // Send Kafka notification to doctor
    this.sendDoctorRejectedPost(doctor, dto.reason, postId);

    const doctorName = `${doctor.firstName} ${doctor.lastName}`;

    return {
      success: true,
      message: 'Post rejected successfully',
      postId,
      doctorId: doctor._id.toString(),
      doctorName,
      status: PostStatus.REJECTED,
      actionAt: new Date(),
      adminId,
      reason: dto.reason,
      doctorNotified: !!doctor.fcmToken,
    };
  }

  /**
   * Get all pending gallery images (for admin review)
   */
  async getAllPendingGalleryImages(): Promise<
    Array<{
      doctorId: string;
      doctorName: string;
      image: GalleryImageWithStatus;
    }>
  > {
    this.logger.log('Fetching all pending gallery images');

    const doctors = await this.doctorModel
      .find({ 'gallery.status': GalleryImageStatus.PENDING })
      .select('_id firstName lastName gallery')
      .exec();

    const pendingImages: Array<{
      doctorId: string;
      doctorName: string;
      image: GalleryImageWithStatus;
    }> = [];

    for (const doctor of doctors) {
      const doctorName = `${doctor.firstName} ${doctor.lastName}`;
      const pending = doctor.gallery?.filter(
        (img) => img.status === GalleryImageStatus.PENDING,
      );

      if (pending) {
        for (const image of pending) {
          pendingImages.push({
            doctorId: doctor._id.toString(),
            doctorName,
            image,
          });
        }
      }
    }

    return pendingImages;
  }

  async getPosts(
    filters: GetPostsFilterDto,
  ): Promise<PaginatedPostsResponseDto> {
    this.logger.log(`Fetching posts with filters: ${JSON.stringify(filters)}`);

    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const skip = (page - 1) * limit;

    // Build query
    const query: any = {};

    // Filter by status
    if (filters.status) {
      query.status = filters.status;
    }

    // Build aggregation pipeline for doctor name search
    const pipeline: any[] = [];

    // Stage 1: Match posts by status
    if (filters.status) {
      pipeline.push({ $match: { status: filters.status } });
    }

    // Stage 2: Lookup doctor information
    pipeline.push({
      $lookup: {
        from: 'doctors',
        localField: 'authorId',
        foreignField: '_id',
        as: 'doctorInfo',
      },
    });

    pipeline.push({
      $unwind: {
        path: '$doctorInfo',
        preserveNullAndEmptyArrays: true,
      },
    });

    // Stage 3: Filter by doctor name (Arabic/English regex)
    if (filters.doctorName) {
      const searchRegex = this.buildDoctorNameRegex(filters.doctorName);

      pipeline.push({
        $match: {
          $or: [
            { 'doctorInfo.firstName': searchRegex },
            { 'doctorInfo.lastName': searchRegex },
            {
              $expr: {
                $regexMatch: {
                  input: {
                    $concat: [
                      '$doctorInfo.firstName',
                      ' ',
                      '$doctorInfo.lastName',
                    ],
                  },
                  regex: filters.doctorName,
                  options: 'i',
                },
              },
            },
          ],
        },
      });
    }

    // Stage 4: Sort by creation date (newest first)
    pipeline.push({ $sort: { createdAt: -1 } });

    // Get total count before pagination
    const countPipeline = [...pipeline, { $count: 'total' }];
    const countResult = await this.postModel.aggregate(countPipeline);
    const totalItems = countResult[0]?.total || 0;

    // Stage 5: Pagination
    pipeline.push({ $skip: skip });
    pipeline.push({ $limit: limit });

    // Execute aggregation
    const posts = await this.postModel.aggregate(pipeline);

    // Transform to DTOs
    const postDtos = posts.map((post) => this.transformToPostDto(post));

    // Calculate pagination
    const totalPages = Math.ceil(totalItems / limit);

    // Get summary statistics
    const summary = await this.getPostsSummary();

    return {
      posts: postDtos,
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
  }

  private sendDoctorApprovedPost(doctor: Doctor, postId: string): void {
    if (!doctor.fcmToken) {
      this.logger.warn(
        `Doctor ${doctor._id.toString()} has no FCM token. Notification not sent.`,
      );
      return;
    }

    const doctorName = `${doctor.firstName} ${doctor.lastName}`;

    const event = {
      eventType: 'ADMIN_APPROVED_POST',
      timestamp: new Date(),
      data: {
        doctorId: doctor._id.toString(),
        doctorName,
        fcmToken: doctor.fcmToken,
        postId,
      },
      metadata: {
        source: 'admin-service',
        version: '1.0',
      },
    };

    try {
      this.kafkaProducer.emit(KAFKA_TOPICS.ADMIN_APPROVED_POST, event);
      this.logger.log(
        `📱 Notification sent to doctor ${doctor._id.toString()} about approved post`,
      );
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Failed to send doctor notification: ${err.message}`);
    }
  }

  private sendDoctorRejectedPost(
    doctor: Doctor,
    reason: string,
    postId: string,
  ): void {
    if (!doctor.fcmToken) {
      this.logger.warn(
        `Doctor ${doctor._id.toString()} has no FCM token. Notification not sent.`,
      );
      return;
    }

    const doctorName = `${doctor.firstName} ${doctor.lastName}`;

    const event = {
      eventType: 'ADMIN_REJECTED_POST',
      timestamp: new Date(),
      data: {
        doctorId: doctor._id.toString(),
        doctorName,
        fcmToken: doctor.fcmToken,
        reason,
        postId,
      },
      metadata: {
        source: 'admin-service',
        version: '1.0',
      },
    };

    try {
      this.kafkaProducer.emit(KAFKA_TOPICS.ADMIN_REJECTED_POST, event);
      this.logger.log(
        `📱 Notification sent to doctor ${doctor._id.toString()} about rejected post`,
      );
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Failed to send doctor notification: ${err.message}`);
    }
  }

  private sendDoctorApprovedGallery(doctor: Doctor, postId: string): void {
    if (!doctor.fcmToken) {
      this.logger.warn(
        `Doctor ${doctor._id.toString()} has no FCM token. Notification not sent.`,
      );
      return;
    }

    const doctorName = `${doctor.firstName} ${doctor.lastName}`;

    const event = {
      eventType: 'ADMIN_APPROVED_GALLERY_IMAGES',
      timestamp: new Date(),
      data: {
        doctorId: doctor._id.toString(),
        doctorName,
        fcmToken: doctor.fcmToken,
        postId,
      },
      metadata: {
        source: 'admin-service',
        version: '1.0',
      },
    };

    try {
      this.kafkaProducer.emit(
        KAFKA_TOPICS.ADMIN_APPROVED_GALLERY_IMAGES,
        event,
      );
      this.logger.log(
        `📱 Notification sent to doctor ${doctor._id.toString()} about approved post`,
      );
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Failed to send doctor notification: ${err.message}`);
    }
  }

  private buildDoctorNameRegex(searchTerm: string): RegExp {
    // Escape special regex characters
    const escaped = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Create case-insensitive regex that works with Arabic and English
    // The 'u' flag enables proper Unicode support for Arabic characters
    return new RegExp(escaped, 'iu');
  }

  /**
   * Get posts summary statistics
   */
  private async getPostsSummary(): Promise<{
    totalPending: number;
    totalApproved: number;
    totalRejected: number;
  }> {
    const stats = await this.postModel.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
        },
      },
    ]);

    const summary = {
      totalPending: 0,
      totalApproved: 0,
      totalRejected: 0,
    };

    stats.forEach((stat) => {
      if (stat._id === PostStatus.PENDING) {
        summary.totalPending = stat.count;
      } else if (stat._id === PostStatus.APPROVED) {
        summary.totalApproved = stat.count;
      } else if (stat._id === PostStatus.REJECTED) {
        summary.totalRejected = stat.count;
      }
    });

    return summary;
  }

  /**
   * Transform aggregation result to DTO
   */
  private transformToPostDto(post: any): PostWithDoctorDto {
    const doctor = post.doctorInfo;

    return {
      postId: post._id.toString(),
      content: post.content,
      title: post.title,
      images: post.images || [],
      status: post.status,
      doctor: {
        doctorId: doctor?._id.toString(),
        fullName: `${doctor?.firstName || ''} ${doctor?.lastName || ''}`.trim(),
        image: doctor?.image,
      },
      createdAt: post.createdAt,
      rejectionReason: post.rejectionReason,
      adminNotes: post.adminNotes,
    };
  }
}
