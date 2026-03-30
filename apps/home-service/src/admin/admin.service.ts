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
import { MinioService } from '@app/common/file-storage';
import { GalleryImageWithStatus } from '../doctor/doctor.service.v2';
import {
  ApprovePostDto,
  GetPostsFilterDto,
  PaginatedPostsResponseDto,
  PostActionResponseDto,
  PostWithDoctorDto,
  RejectPostDto,
} from './dto/approved-reject-post.dto';
import { GetQuestionsFilterDto } from './dto/get-questions.filter.dto';
import { PaginatedQuestionsResponseDto } from './dto/question-response.dto';
import { Question } from '@app/common/database/schemas/question.schema';
import { User, UserDocument } from '@app/common/database/schemas/user.schema';
import { GetDoctorsFilterDto } from './dto/get-doctors.filter.dto';
import {
  DoctorListItemDto,
  PaginatedDoctorsResponseDto,
} from './dto/doctor-response.dto';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);
  constructor(
    @InjectModel(Admin.name) private adminModel: Model<AdminDocument>,
    @InjectModel(Doctor.name) private doctorModel: Model<Doctor>,
    @InjectModel(Post.name) private readonly postModel: Model<Post>,
    @InjectModel(Hospital.name) private hospitalModel: Model<Hospital>,
    @InjectModel(Center.name) private centerModel: Model<Center>,
    @InjectModel(Question.name) private questionModel: Model<Question>,
    @InjectModel(User.name) private patientModel: Model<User>,
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

    if (approvedDoctor) {
      try {
        const phone = approvedDoctor.phones?.[0]?.normal?.[0];
        const doctorName = `${approvedDoctor.firstName} ${approvedDoctor.lastName}`;

        this.kafkaProducer.emit(KAFKA_TOPICS.WHATSAPP_DOCTOR_APPROVED, {
          phone,
          doctorName,
        });
      } catch (error) {
        this.logger.error('Failed to publish Kafka event', error);
      }
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

    if (rejectedDoctor) {
      try {
        const phone = rejectedDoctor.phones?.[0]?.normal?.[0];
        const doctorName = `${rejectedDoctor.firstName} ${rejectedDoctor.lastName}`;

        this.kafkaProducer.emit(KAFKA_TOPICS.WHATSAPP_DOCTOR_REJECTED, {
          phone,
          doctorName,
        });
      } catch (error) {
        this.logger.error('Failed to publish Kafka event', error);
      }
    }

    return rejectedDoctor;
  }

  // private async publishDoctorApprovedEvent(
  //   doctor: DoctorDocument,
  // ): Promise<void> {
  //   const event = {
  //     eventType: 'DOCTOR_APPROVED',
  //     timestamp: new Date(),
  //     data: {
  //       doctorId: doctor._id.toString(),
  //       fullName: `${doctor.firstName} ${doctor.middleName} ${doctor.lastName}`,
  //       phone: doctor.phones
  //         .map((p) => p.normal || p.clinic || p.whatsup)
  //         .flat()
  //         .join(', '),
  //     },
  //     metadata: {
  //       source: 'approved-service',
  //       version: '1.0',
  //     },
  //   };

  //   try {
  //     // Use emit for fire-and-forget events
  //     await this.kafkaProducer.emit(KAFKA_TOPICS.DOCTOR_APPROVED, event);
  //   } catch (error) {
  //     const err = new Error(
  //       `Failed to publish Approved event: ${error.message}`,
  //     );
  //     this.logger.error(err.message);
  //   }
  // }

  // private async publishDoctorRejectedEvent(
  //   doctor: DoctorDocument,
  //   reason: string,
  // ): Promise<void> {
  //   const event = {
  //     eventType: 'DOCTOR_REJECTED',
  //     timestamp: new Date(),
  //     data: {
  //       doctorId: doctor._id.toString(),
  //       fullName: `${doctor.firstName} ${doctor.middleName} ${doctor.lastName}`,
  //       phone: doctor.phones
  //         .map((p) => p.normal || p.clinic || p.whatsup)
  //         .flat()
  //         .join(', '),
  //       reason,
  //     },
  //     metadata: {
  //       source: 'rejected-service',
  //       version: '1.0',
  //     },
  //   };

  //   try {
  //     // Use emit for fire-and-forget events
  //     await this.kafkaProducer.emit(KAFKA_TOPICS.DOCTOR_REJECTED, event);
  //   } catch (error) {
  //     const err = new Error(
  //       `Failed to publish Rejected event: ${error.message}`,
  //     );
  //     this.logger.error(err.message);
  //   }
  // }

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
    const doctor = await this.doctorModel
      .findOne({ _id: doctorId })
      .select('gallery fcmToken firstName lastName') // fetch full gallery, filter in JS
      .lean();
    if (!doctor) {
      throw new NotFoundException('Doctor not found');
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
    this.sendDoctorApprovedGallery(doctor, imageIds);
    this.logger.log(`${result.modifiedCount} images approved`);
  }

  /**
   * Admin rejects gallery image and deletes from MinIO
   */
  async rejectGalleryImages(
    doctorId: string,
    imageIds: string[],
    reason: string,
    adminId: string,
  ): Promise<void> {
    this.logger.log(
      `Rejecting ${imageIds.length} images for doctor ${doctorId} by admin ${adminId}`,
    );

    if (!Types.ObjectId.isValid(doctorId)) {
      throw new BadRequestException('Invalid doctor ID');
    }

    const doctor = await this.doctorModel
      .findOne({ _id: doctorId })
      .select('gallery fcmToken firstName lastName') // fetch full gallery, filter in JS
      .lean();

    // then filter:

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
    this.sendDoctorRejectedGallery(doctor, reason, imageIds);
    this.logger.log(`${imagesToDelete.length} images rejected and removed`);
  }

  /**
   * Get gallery images filtered by status
   */
  async getGalleryImages(
    doctorId: string,
    page: number = 1,
    limit: number = 20,
    status?: GalleryImageStatus,
  ): Promise<{
    gallery: { data: GalleryImageWithStatus[] };
    meta: {
      currentPage: number;
      totalPages: number;
      totalItems: number;
      itemsPerPage: number;
      hasNextPage: boolean;
      hasPreviousPage: boolean;
    };
  }> {
    if (!Types.ObjectId.isValid(doctorId)) {
      throw new BadRequestException('Invalid doctor ID');
    }

    const skip = (page - 1) * limit;

    const pipeline: any[] = [
      // Stage 1: match the specific doctor
      { $match: { _id: new Types.ObjectId(doctorId) } },

      // Stage 2: flatten gallery
      { $unwind: { path: '$gallery', preserveNullAndEmptyArrays: false } },

      // Stage 3: filter by status if provided
      ...(status ? [{ $match: { 'gallery.status': status } }] : []),

      // Stage 4: project only the image
      { $project: { _id: 0, image: '$gallery' } },

      // Stage 5: sort newest first
      { $sort: { 'image.uploadedAt': -1 } },
    ];

    // Run count and data in parallel
    const [countResult, data] = await Promise.all([
      this.doctorModel.aggregate([...pipeline, { $count: 'total' }]),
      this.doctorModel.aggregate([
        ...pipeline,
        { $skip: skip },
        { $limit: limit },
      ]),
    ]);

    // If doctor doesn't exist at all, catch it
    const doctorExists = await this.doctorModel.exists({
      _id: new Types.ObjectId(doctorId),
    });
    if (!doctorExists) {
      throw new NotFoundException('Doctor not found');
    }

    const totalItems = countResult[0]?.total || 0;
    const totalPages = Math.ceil(totalItems / limit);

    return {
      gallery: {
        data: data.map((d) => d.image),
      },
      meta: {
        currentPage: page,
        totalPages,
        totalItems,
        itemsPerPage: limit,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
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
    const doctor = await this.doctorModel
      .findOne({ authAccountId: new Types.ObjectId(post.authorId) })
      .exec();
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
    const doctor = await this.doctorModel
      .findOne({ authAccountId: new Types.ObjectId(post.authorId) })
      .exec();
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
  async getAllPendingGalleryImages(
    page: number = 1,
    limit: number = 20,
    dateFrom?: string, // ← أضف هذا
    dateTo?: string, // ← أضف هذا
  ): Promise<{
    gallery: {
      data: Array<{
        doctorId: string;
        doctorName: string;
        doctorImage: string; // ← أضف
        publicSpecialization: string; // ← أضف
        privateSpecialization: string; // ← أضف
        image: GalleryImageWithStatus;
      }>;
    };
    meta: {
      currentPage: number;
      totalPages: number;
      totalItems: number;
      itemsPerPage: number;
      hasNextPage: boolean;
      hasPreviousPage: boolean;
    };
  }> {
    this.logger.log(
      `Fetching pending gallery images — page ${page}, limit ${limit}`,
    );
    const skip = (page - 1) * limit;

    const pipeline: any[] = [
      // Stage 1: only doctors that have at least one pending image
      { $match: { 'gallery.status': GalleryImageStatus.PENDING } },
      // Stage 2: flatten gallery array — one doc per image
      { $unwind: '$gallery' },
      // Stage 3: keep only pending images
      { $match: { 'gallery.status': GalleryImageStatus.PENDING } },
    ];

    // Stage 4: filter by uploadedAt date range  ← أضف هذا
    if (dateFrom || dateTo) {
      const dateMatch: any = {};
      if (dateFrom) {
        const from = new Date(dateFrom);
        from.setHours(0, 0, 0, 0);
        dateMatch.$gte = from;
      }
      if (dateTo) {
        const to = new Date(dateTo);
        to.setHours(23, 59, 59, 999);
        dateMatch.$lte = to;
      }
      pipeline.push({ $match: { 'gallery.uploadedAt': dateMatch } });
    }

    pipeline.push(
      // Stage 5: shape the output
      {
        $project: {
          _id: 0,
          doctorId: { $toString: '$_id' },
          doctorName: {
            $trim: {
              input: { $concat: ['$firstName', ' ', '$lastName'] },
            },
          },
          doctorImage: '$image', // ← أضف
          publicSpecialization: '$publicSpecialization', // ← أضف
          privateSpecialization: '$privateSpecialization', // ← أضف
          image: '$gallery',
        },
      },
      // Stage 6: stable sort (newest uploaded first)
      { $sort: { 'image.uploadedAt': -1 } },
    );

    // Count total before pagination
    const countResult = await this.doctorModel.aggregate([
      ...pipeline,
      { $count: 'total' },
    ]);
    const totalItems = countResult[0]?.total || 0;

    // Apply pagination
    pipeline.push({ $skip: skip });
    pipeline.push({ $limit: limit });

    const data = await this.doctorModel.aggregate(pipeline);
    const totalPages = Math.ceil(totalItems / limit);

    return {
      gallery: {
        data,
      },
      meta: {
        currentPage: page,
        totalPages,
        totalItems,
        itemsPerPage: limit,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
  }

  async getPosts(
    filters: GetPostsFilterDto,
  ): Promise<PaginatedPostsResponseDto> {
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const skip = (page - 1) * limit;

    const pipeline: any[] = [];

    // ==================== FILTERS ====================

    if (filters.status) {
      pipeline.push({ $match: { status: filters.status } });
    }

    // Filter by date range
    if (filters.dateFrom || filters.dateTo) {
      const dateMatch: any = {};
      if (filters.dateFrom) {
        const from = new Date(filters.dateFrom);
        from.setHours(0, 0, 0, 0);
        dateMatch.$gte = from;
      }
      if (filters.dateTo) {
        const to = new Date(filters.dateTo);
        to.setHours(23, 59, 59, 999);
        dateMatch.$lte = to;
      }
      pipeline.push({ $match: { createdAt: dateMatch } });
    }

    // Filter by doctor name requires fetching matching doctorIds first
    if (filters.doctorName) {
      const searchRegex = this.buildDoctorNameRegex(filters.doctorName);
      const matchingDoctors = await this.doctorModel
        .find({
          $or: [{ firstName: searchRegex }, { lastName: searchRegex }],
        })
        .select('authAccountId')
        .lean();
      const matchingIds = matchingDoctors.map((d) => d.authAccountId);
      pipeline.push({ $match: { authorId: { $in: matchingIds } } });
    }

    pipeline.push({ $sort: { createdAt: -1 } });

    // ==================== COUNT ====================

    const countPipeline = [...pipeline, { $count: 'total' }];
    const countResult = await this.postModel.aggregate(countPipeline);
    const totalItems = countResult[0]?.total || 0;

    // ==================== PAGINATION ====================

    pipeline.push({ $skip: skip });
    pipeline.push({ $limit: limit });

    const posts = await this.postModel.aggregate(pipeline);

    // ==================== DOCTOR ENRICHMENT ====================

    const authorIds = [
      ...new Set(posts.map((p) => p.authorId?.toString()).filter(Boolean)),
    ];

    // ↓ أضفنا publicSpecialization و privateSpecialization هنا
    const doctors = await this.doctorModel
      .find({
        authAccountId: { $in: authorIds.map((id) => new Types.ObjectId(id)) },
      })
      .select(
        'firstName lastName image authAccountId publicSpecialization privateSpecialization',
      )
      .lean();

    const doctorMap = new Map(
      doctors.map((d) => [d.authAccountId.toString(), d]),
    );

    const postDtos = posts.map((post) => {
      const doctor = doctorMap.get(post.authorId?.toString());
      return this.transformToPostDto({ ...post, doctorInfo: doctor ?? null });
    });

    // ==================== RESPONSE ====================

    const totalPages = Math.ceil(totalItems / limit);
    const summary = await this.getPostsSummary();

    return {
      posts: {
        data: postDtos,
      },
      meta: {
        currentPage: page,
        totalPages,
        totalItems,
        itemsPerPage: limit,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
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

  private sendDoctorApprovedGallery(
    doctor: Doctor,
    GalleryIds: string[],
  ): void {
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
        GalleryIds,
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

  private sendDoctorRejectedGallery(
    doctor: Doctor,
    rejectionReason: string,
    GalleryIds: string[],
  ): void {
    if (!doctor.fcmToken) {
      this.logger.warn(
        `Doctor ${doctor._id.toString()} has no FCM token. Notification not sent.`,
      );
      return;
    }

    const doctorName = `${doctor.firstName} ${doctor.lastName}`;

    const event = {
      eventType: 'ADMIN_REJECTED_GALLERY_IMAGES',
      timestamp: new Date(),
      data: {
        doctorId: doctor._id.toString(),
        doctorName,
        fcmToken: doctor.fcmToken,
        rejectionReason,
        GalleryIds,
      },
      metadata: {
        source: 'admin-service',
        version: '1.0',
      },
    };

    try {
      this.kafkaProducer.emit(
        KAFKA_TOPICS.ADMIN_REJECTED_GALLERY_IMAGES,
        event,
      );
      this.logger.log(
        `📱 Notification sent to doctor ${doctor._id.toString()} about rejected post`,
      );
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Failed to send doctor notification: ${err.message}`);
    }
  }

  // In admin.service.ts

  async getQuestions(
    filters: GetQuestionsFilterDto,
  ): Promise<PaginatedQuestionsResponseDto> {
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const skip = (page - 1) * limit;

    const matchStage: any = {};

    if (filters.approvalStatus as ApprovalStatus) {
      matchStage.approvalStatus = filters.approvalStatus;
    }

    // ==================== DATE FILTER ====================
    if (filters.dateFrom || filters.dateTo) {
      const dateMatch: any = {};
      if (filters.dateFrom) {
        const from = new Date(filters.dateFrom);
        from.setHours(0, 0, 0, 0);
        dateMatch.$gte = from;
      }
      if (filters.dateTo) {
        const to = new Date(filters.dateTo);
        to.setHours(23, 59, 59, 999);
        dateMatch.$lte = to;
      }
      matchStage.createdAt = dateMatch;
    }
    // =====================================================

    const pipeline: any[] = [
      { $match: matchStage },
      { $sort: { createdAt: -1 } },
    ];

    const [countResult, questions] = await Promise.all([
      this.questionModel.aggregate([...pipeline, { $count: 'total' }]),
      this.questionModel.aggregate([
        ...pipeline,
        { $skip: skip },
        { $limit: limit },
      ]),
    ]);

    const totalItems = countResult[0]?.total || 0;
    const totalPages = Math.ceil(totalItems / limit);

    // ==================== USER ENRICHMENT ====================
    const userIds = [
      ...new Set(questions.map((q) => q.userId?.toString()).filter(Boolean)),
    ];

    const users = await this.patientModel
      .find({
        _id: { $in: userIds.map((id) => new Types.ObjectId(id)) },
      })
      .select('username profileImage')
      .lean();

    const userMap = new Map(users.map((u) => [u._id.toString(), u]));
    // =========================================================

    return {
      questions: {
        data: questions.map((q) => {
          const user = userMap.get(q.userId?.toString());
          return {
            questionId: q._id.toString(),
            userId: q.userId?.toString(),
            username: user?.username ?? null, // ← أضف
            userImage: user?.profileImage ?? null, // ← أضف
            content: q.content,
            images: q.images || [],
            specializationIds:
              q.specializationId?.map((id) => id.toString()) || [],
            approvalStatus: q.approvalStatus,
            hasText: q.hasText,
            hasImages: q.hasImages,
            createdAt: q.createdAt,
            rejectionReason: q.rejectionReason,
          };
        }),
      },
      meta: {
        currentPage: page,
        totalPages,
        totalItems,
        itemsPerPage: limit,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
  }

  async approveQuestions(
    questionIds: string[],
    adminId: string,
  ): Promise<void> {
    this.logger.log(
      `Admin ${adminId} approving ${questionIds.length} question(s)`,
    );

    const objectIds = questionIds.map((id) => {
      if (!Types.ObjectId.isValid(id)) {
        throw new BadRequestException(`Invalid question ID: ${id}`);
      }
      return new Types.ObjectId(id);
    });

    const result = await this.questionModel.updateMany(
      {
        _id: { $in: objectIds },
        approvalStatus: { $ne: ApprovalStatus.APPROVED },
      },
      {
        $set: {
          approvalStatus: ApprovalStatus.APPROVED,
          approvedAt: new Date(),
          approvedBy: adminId,
        },
      },
    );

    if (result.matchedCount === 0) {
      throw new NotFoundException('No matching questions found');
    }
    if (result.modifiedCount === 0) {
      throw new BadRequestException(
        'All selected questions are already approved',
      );
    }

    // Fetch questions to get userIds for notifications
    const questions = await this.questionModel
      .find({ _id: { $in: objectIds } })
      .select('userId')
      .lean();

    // Group questionIds by userId so each user gets one notification
    const userQuestionMap = new Map<string, string[]>();

    for (const q of questions) {
      const userId = q.userId.toString();

      if (!userQuestionMap.has(userId)) {
        userQuestionMap.set(userId, []);
      }

      userQuestionMap.get(userId)!.push(q._id.toString());
    }

    // Send one Kafka event per user
    for (const [userId, ids] of userQuestionMap) {
      const user = await this.patientModel
        .findById(userId)
        .select('fcmToken username')
        .lean();
      if (user) {
        this.sendUserApprovedQuestions(user, ids);
      }
    }

    this.logger.log(`${result.modifiedCount} question(s) approved`);
  }

  async rejectQuestions(
    questionIds: string[],
    reason: string,
    adminId: string,
  ): Promise<void> {
    this.logger.log(
      `Admin ${adminId} rejecting ${questionIds.length} question(s)`,
    );

    const objectIds = questionIds.map((id) => {
      if (!Types.ObjectId.isValid(id)) {
        throw new BadRequestException(`Invalid question ID: ${id}`);
      }
      return new Types.ObjectId(id);
    });

    const result = await this.questionModel.updateMany(
      {
        _id: { $in: objectIds },
        approvalStatus: { $ne: ApprovalStatus.REJECTED },
      },
      {
        $set: {
          approvalStatus: ApprovalStatus.REJECTED,
          rejectionReason: reason,
          rejectedAt: new Date(),
          rejectedBy: adminId,
        },
      },
    );

    if (result.matchedCount === 0) {
      throw new NotFoundException('No matching questions found');
    }
    if (result.modifiedCount === 0) {
      throw new BadRequestException(
        'All selected questions are already rejected',
      );
    }

    const questions = await this.questionModel
      .find({ _id: { $in: objectIds } })
      .select('userId')
      .lean();

    const userQuestionMap = new Map<string, string[]>();

    for (const q of questions) {
      const userId = q.userId.toString();

      if (!userQuestionMap.has(userId)) {
        userQuestionMap.set(userId, []);
      }

      userQuestionMap.get(userId)!.push(q._id.toString());
    }

    for (const [userId, ids] of userQuestionMap) {
      const user = await this.patientModel
        .findById(userId)
        .select('fcmToken username')
        .lean();
      if (user) {
        this.sendUserRejectedQuestions(user, ids, reason);
      }
    }

    this.logger.log(`${result.modifiedCount} question(s) rejected`);
  }

  // ─── Kafka event emitters ────────────────────────────────────────────────────

  private sendUserApprovedQuestions(
    user: UserDocument,
    questionIds: string[],
  ): void {
    if (!user.fcmToken) {
      this.logger.warn(
        `User ${user._id.toString()} has no FCM token. Notification not sent.`,
      );
      return;
    }

    const event = {
      eventType: 'ADMIN_APPROVED_USER_QUESTIONS',
      timestamp: new Date(),
      data: {
        userId: user._id.toString(),
        userName: user.username,
        fcmToken: user.fcmToken,
        questionIds,
      },
      metadata: {
        source: 'admin-service',
        version: '1.0',
      },
    };

    try {
      this.kafkaProducer.emit(
        KAFKA_TOPICS.ADMIN_APPROVED_USER_QUESTIONS,
        event,
      );
      this.logger.log(
        `📱 Approval notification sent to user ${user._id.toString()} for ${questionIds.length} question(s)`,
      );
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Failed to send approval notification: ${err.message}`);
    }
  }

  private sendUserRejectedQuestions(
    user: UserDocument,
    questionIds: string[],
    reason: string,
  ): void {
    if (!user.fcmToken) {
      this.logger.warn(
        `User ${user._id.toString()} has no FCM token. Notification not sent.`,
      );
      return;
    }

    const event = {
      eventType: 'ADMIN_REJECTED_USER_QUESTIONS',
      timestamp: new Date(),
      data: {
        userId: user._id.toString(),
        userName: user.username,
        fcmToken: user.fcmToken,
        questionIds,
        rejectionReason: reason,
      },
      metadata: {
        source: 'admin-service',
        version: '1.0',
      },
    };

    try {
      this.kafkaProducer.emit(
        KAFKA_TOPICS.ADMIN_REJECTED_USER_QUESTIONS,
        event,
      );
      this.logger.log(
        `📱 Rejection notification sent to user ${user._id.toString()} for ${questionIds.length} question(s)`,
      );
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `Failed to send rejection notification: ${err.message}`,
      );
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
    // const doctorInfo = post.doctorInfo;

    return {
      postId: post._id.toString(),
      content: post.content,
      title: post.title,
      images: post.images || [],
      status: post.status,
      doctorInfo: post.doctorInfo
        ? {
            fullName: `${post.doctorInfo.firstName} ${post.doctorInfo.lastName}`,
            image: post.doctorInfo.image ?? null,
            publicSpecialization: post.doctorInfo.publicSpecialization ?? null,
            privateSpecialization:
              post.doctorInfo.privateSpecialization ?? null,
          }
        : undefined,
      createdAt: post.createdAt,
      rejectionReason: post.rejectionReason,
      adminNotes: post.adminNotes,
    } as PostWithDoctorDto;
  }
  async getDoctors(
    filters: GetDoctorsFilterDto,
  ): Promise<PaginatedDoctorsResponseDto> {
    this.logger.log(
      `Fetching doctors with filters: ${JSON.stringify(filters)}`,
    );

    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const skip = (page - 1) * limit;

    const matchStage: any = {};

    if (filters.status) {
      matchStage.status = filters.status;
    }
    if (filters.gender) {
      matchStage.gender = filters.gender;
    }
    if (filters.city) {
      matchStage.city = { $regex: filters.city, $options: 'i' };
    }
    if (filters.subCity) {
      matchStage.subCity = { $regex: filters.city, $options: 'i' };
    }
    if (filters.publicSpecialization) {
      matchStage.publicSpecialization = {
        $regex: filters.publicSpecialization,
        $options: 'i',
      };
    }
    if (filters.privateSpecialization) {
      matchStage.privateSpecialization = {
        $regex: filters.privateSpecialization,
        $options: 'i',
      };
    }
    if (filters.name) {
      const searchRegex = this.buildDoctorNameRegex(filters.name);
      matchStage.$or = [
        { firstName: searchRegex },
        { middleName: searchRegex },
        { lastName: searchRegex },
        {
          $expr: {
            $regexMatch: {
              input: {
                $concat: ['$firstName', ' ', '$middleName', ' ', '$lastName'],
              },
              regex: filters.name,
              options: 'i',
            },
          },
        },
      ];
    }

    // ==================== PROFILE COMPLETION ====================
    // Adjust these fields to match your actual Doctor schema
    const profileFields = [
      '$firstName',
      '$middleName',
      '$lastName',
      '$gender',
      '$city',
      '$subCity',
      '$publicSpecialization',
      '$privateSpecialization',
      '$image',
      '$phones',
      '$bio',
      '$dateOfBirth',
      '$inspectionDuration',
      '$inspectionPrice',
      '$experienceStartDate',
      '$yearsOfExperience',
      '$workingHours',
    ];

    const totalFields = profileFields.length;

    const completionFields = profileFields.map((field) => ({
      $cond: [{ $gt: [field, null] }, 1, 0],
    }));
    // ============================================================

    const pipeline: any[] = [
      { $match: matchStage },
      { $sort: { createdAt: -1 } },
      {
        $addFields: {
          profileCompletionScore: {
            $add: completionFields,
          },
        },
      },
      {
        $addFields: {
          profileCompletionPercentage: {
            $round: [
              {
                $multiply: [
                  { $divide: ['$profileCompletionScore', totalFields] },
                  100,
                ],
              },
              1,
            ],
          },
        },
      },
    ];

    console.log(matchStage);

    const [countResult, doctors] = await Promise.all([
      this.doctorModel.aggregate([...pipeline, { $count: 'total' }]),
      this.doctorModel.aggregate([
        ...pipeline,
        { $skip: skip },
        { $limit: limit },
        {
          $project: {
            _id: 1,
            firstName: 1,
            middleName: 1,
            lastName: 1,
            gender: 1,
            status: 1,
            city: 1,
            subcity: 1,
            publicSpecialization: 1,
            privateSpecialization: 1,
            image: 1,
            phones: 1,
            rejectionReason: 1,
            approvedAt: 1,
            rejectedAt: 1,
            registeredAt: 1,
            lastLoginAt: 1,
            createdAt: 1,
            profileCompletionPercentage: 1,
          },
        },
      ]),
    ]);

    const totalItems = countResult[0]?.total || 0;
    const totalPages = Math.ceil(totalItems / limit);

    return {
      doctors: {
        data: doctors.map((d) => this.transformToDoctorDto(d)),
      },
      meta: {
        currentPage: page,
        totalPages,
        totalItems,
        itemsPerPage: limit,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
  }

  private transformToDoctorDto(doctor: any): DoctorListItemDto {
    return {
      doctorId: doctor._id.toString(),
      firstName: doctor.firstName,
      middleName: doctor.middleName,
      lastName: doctor.lastName,
      fullName:
        `${doctor.firstName} ${doctor.middleName} ${doctor.lastName}`.trim(),
      gender: doctor.gender,
      status: doctor.status,
      city: doctor.city,
      subcity: doctor.subcity,
      publicSpecialization: doctor.publicSpecialization,
      privateSpecialization: doctor.privateSpecialization,
      profileCompletionPercentage: doctor.profileCompletionPercentage ?? 0,
      image: doctor.image,
      phones: doctor.phones || [],
      isSubscribed: doctor.isSubscribed,
      rejectionReason: doctor.rejectionReason,
      approvedAt: doctor.approvedAt,
      rejectedAt: doctor.rejectedAt,
      registeredAt: doctor.registeredAt,
      lastLoginAt: doctor.lastLoginAt,
      createdAt: doctor.createdAt,
    } as DoctorListItemDto;
  }
  async getDoctorById(
    doctorId: string,
  ): Promise<{ doctor: DoctorListItemDto }> {
    if (!Types.ObjectId.isValid(doctorId)) {
      throw new BadRequestException('Invalid doctor ID');
    }

    const doctor = await this.doctorModel
      .findById(doctorId)
      .select('-password -twoFactorSecret -sessions -deviceTokens')
      .lean();

    if (!doctor) {
      throw new NotFoundException('Doctor not found');
    }

    return {
      doctor: this.transformToDoctorDto(doctor),
    };
  }
}
