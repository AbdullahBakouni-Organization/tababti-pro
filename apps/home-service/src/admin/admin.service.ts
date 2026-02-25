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
  PostStatus,
  UserRole,
} from '@app/common/database/schemas/common.enums';
import { KAFKA_TOPICS } from '@app/common/kafka/events/topics';
import { KafkaService } from '@app/common/kafka/kafka.service';
import { PostModule } from 'apps/social-service/src/content/post.module';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);
  constructor(
    @InjectModel(Admin.name) private adminModel: Model<AdminDocument>,
    @InjectModel(Doctor.name) private doctorModel: Model<Doctor>,
    @InjectModel(PostModule.name) private postModel: Model<Post>,
    @InjectModel(Hospital.name) private hospitalModel: Model<Hospital>,
    @InjectModel(Center.name) private centerModel: Model<Center>,
    @InjectModel(AuthAccount.name) private authAccountModel: Model<AuthAccount>,
    private kafkaProducer: KafkaService,
  ) { }

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

    const post = await this.postModel.findById(postId);
    if (!post) {
      throw new NotFoundException('post.NOT_FOUND');
    }

    // Only allow status changes if post is pending, approved, or rejected
    const validStatuses = [PostStatus.PENDING, PostStatus.APPROVED, PostStatus.REJECTED, PostStatus.PUBLISHED, PostStatus.DELETED];
    if (!validStatuses.includes(status)) {
      throw new BadRequestException('post.INVALID_STATUS');
    }

    post.status = status;
    post.updatedByAdminId = adminId; 
    post.updatedAt = new Date();

    await post.save();
    return post;
  }
}
