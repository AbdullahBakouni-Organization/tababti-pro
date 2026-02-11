// ============================================
// Doctor Registration Service
// ============================================

import {
  Injectable,
  ConflictException,
  BadRequestException,
  Logger,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  Doctor,
  DoctorDocument,
} from '../../../../libs/common/src/database/schemas/doctor.schema';
import {
  DoctorRegistrationDtoValidated,
  CityMapping,
  SpecialtyMapping,
} from './dto/sign-up.dto';
import { KafkaService } from '@app/common/kafka/kafka.service';
import { KAFKA_TOPICS } from '@app/common/kafka/events/topics';
import {
  ApprovalStatus,
  NotificationStatus,
  NotificationTypes,
  UserRole,
} from '@app/common/database/schemas/common.enums';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { Connection } from 'mongoose';
// import { FreeTrialService } from './free-trial.service';
// import { SubscriptionOwnerType } from '../schemas/subscription.schema';
import { ClientSession } from 'mongoose';
import { Notification } from '@app/common/database/schemas/notification.schema';
import { DoctorLoginDto } from './dto/login.dto';
import {
  RequestDoctorPasswordResetDto,
  ResetDoctorPasswordDto,
  VerifyOtpForPasswordResetDto,
} from './dto/doctor-forgot-password.dto';
import { Otp, OtpDocument } from '@app/common/database/schemas/otp.schema';
import { SmsService } from '../sms/sms.service';
import { AuthAccount } from '@app/common/database/schemas/auth.schema';
// ============================================
// Kafka Events
// ============================================

export interface DoctorRegisteredEvent {
  eventType: 'DOCTOR_REGISTERED';
  timestamp: Date;
  data: {
    doctorId: string;
    fullName: string;
    phone: string;
    city: string;
    subcity: string;
    publicSpecialization: string;
    privateSpecialization: string;
    certificateImage: string;
    licenseImage: string;
    uploadedFiles?: {
      certificateImage?: string;
      licenseImage?: string;
      certificateDocument?: string;
      licenseDocument?: string;
    };
    gender: string;
    status: ApprovalStatus;
    registeredAt: Date;
  };
  metadata: {
    source: 'registration-service';
    version: '1.0';
  };
}

// ============================================
// Registration Service
// ============================================

@Injectable()
export class DoctorService {
  private readonly logger = new Logger(DoctorService.name);
  private readonly SOCKET_SERVICE_URL: string;

  constructor(
    @InjectModel(Doctor.name) private doctorModel: Model<DoctorDocument>,
    @InjectModel(Notification.name)
    private readonly notificationModel: Model<Notification>,
    @InjectModel(Otp.name) private otpModel: Model<OtpDocument>,
    @InjectModel(AuthAccount.name) private authModel: Model<AuthAccount>,
    @InjectConnection() private readonly connection: Connection,

    private kafkaProducer: KafkaService,
    private httpService: HttpService,
    private configService: ConfigService,
    private readonly smsService: SmsService,
  ) {
    this.SOCKET_SERVICE_URL =
      this.configService.get('SOCKET_SERVICE_URL') || '';
  }

  // ============================================
  // Validation Methods
  // ============================================

  /**
   * Validate nested enum: Subcity must belong to City
   */
  private validateSubcity(city: string, subcity: string): void {
    const validSubcities = CityMapping[city] as string[] | undefined;

    if (!validSubcities || !validSubcities.includes(subcity)) {
      throw new BadRequestException(
        `Subcity "${subcity}" is not valid for city "${city}". ` +
          `Valid options: ${validSubcities?.join(', ') || 'None'}`,
      );
    }
  }

  /**
   * Validate nested enum: PrivateSpecialization must belong to PublicSpecialization
   */
  private validateSpecialization(
    publicSpec: string,
    privateSpec: string,
  ): void {
    const validPrivateSpecs = SpecialtyMapping[publicSpec] as
      | string[]
      | undefined;

    if (!validPrivateSpecs || !validPrivateSpecs.includes(privateSpec)) {
      throw new BadRequestException(
        `Private specialization "${privateSpec}" does not belong to ` +
          `public specialization "${publicSpec}". ` +
          `Valid options: ${validPrivateSpecs?.join(', ') || 'None'}`,
      );
    }
  }

  private async checkDuplicatePending(
    dto: DoctorRegistrationDtoValidated,
    session?: ClientSession,
  ): Promise<void> {
    // Check if there's a PENDING registration with same phone
    const existingPending = await this.doctorModel.findOne(
      {
        'phones.normal': dto.phone,
        status: ApprovalStatus.PENDING,
      },
      null,
      { session },
    );

    if (existingPending) {
      throw new ConflictException(
        'A registration request with this phone number is already pending approval. ' +
          'You cannot submit a new registration until your current request is processed. ' +
          `Status: ${existingPending.status}, ` +
          `Submitted: ${existingPending?.registeredAt?.toLocaleDateString()}`,
      );
    }

    // Alternative check: Same name + pending
    const existingByName = await this.doctorModel.findOne(
      {
        firstName: dto.firstName,
        middleName: dto.middleName,
        lastName: dto.lastName,
        status: ApprovalStatus.PENDING,
      },
      null,
      { session },
    );

    if (existingByName) {
      throw new ConflictException(
        'A registration request with this name is already pending approval. ' +
          `If this is you, please contact support. ` +
          `Phone: ${existingByName.phones
            .map((p) => p.normal || p.clinic || p.whatsup)
            .flat()
            .join(', ')}`,
      );
    }
  }

  private async checkPhoneExists(
    phone: string,
    session?: ClientSession,
  ): Promise<void> {
    const existing = await this.doctorModel.findOne(
      {
        'phones.normal': phone,
        status: { $in: [ApprovalStatus.APPROVED, ApprovalStatus.SUSPENDED] },
      },
      null,
      { session },
    );

    if (existing) {
      throw new ConflictException(
        `This phone number is already registered. ` +
          `Status: ${existing.status}. ` +
          `Please use a different phone number or contact support.`,
      );
    }
  }
  // ============================================
  // Registration Method
  // ============================================

  async registerDoctor(
    dto: DoctorRegistrationDtoValidated,
    files?: {
      certificateImage?: Express.Multer.File;
      licenseImage?: Express.Multer.File;
      certificateDocument?: Express.Multer.File;
      licenseDocument?: Express.Multer.File;
    },
  ): Promise<DoctorDocument> {
    this.logger.log(`Registration attempt: ${dto.phone}`);

    const session = await this.connection.startSession();

    try {
      let doctor: DoctorDocument;

      await session.withTransaction(async () => {
        // 1. Validate nested enums
        this.validateSubcity(dto.city, dto.subcity);
        this.validateSpecialization(
          dto.publicSpecialization,
          dto.privateSpecialization,
        );

        // 2. Check for duplicates (transaction-safe)
        await this.checkPhoneExists(dto.phone, session);
        await this.checkDuplicatePending(dto, session);

        // 3. Process uploaded files
        const processedFiles = this.processUploadedFiles(files);

        // 4. Create doctor entity
        doctor = new this.doctorModel({
          firstName: dto.firstName,
          middleName: dto.middleName,
          lastName: dto.lastName,
          password: dto.password,
          phones: [
            {
              normal: [dto.phone],
              clinic: [],
              whatsup: [],
            },
          ],
          city: dto.city,
          subcity: dto.subcity,
          publicSpecialization: dto.publicSpecialization,
          privateSpecialization: dto.privateSpecialization,
          certificateImage: processedFiles.certificateImage || undefined,
          licenseImage: processedFiles.licenseImage || undefined,
          certificateDocument: processedFiles.certificateDocument || undefined,
          licenseDocument: processedFiles.licenseDocument || undefined,
          gender: dto.gender,
          status: ApprovalStatus.PENDING,
          sessions: [],
          maxSessions: 5,
          failedLoginAttempts: 0,
        });
        if (doctor.authAccountId) {
          throw new BadRequestException('Doctor already has auth account');
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
          throw new BadRequestException(
            'Doctor has no normalized phone numbers',
          );
        }
        const existing = await this.authModel
          .findOne({ phones: { $in: normalizedPhones } })
          .session(session);

        if (existing) {
          throw new BadRequestException(
            'One or more phone numbers already belong to another account',
          );
        }

        // 3️⃣ Create AuthAccount (phones copied from doctor)
        const [authAccount] = await this.authModel.create(
          [
            {
              role: UserRole.DOCTOR,
              phones: normalizedPhones,
              isActive: false,
              tokenVersion: 0,
            },
          ],
          { session },
        );
        doctor.authAccountId = authAccount._id;
        // 5. Save doctor (inside transaction)
        await doctor.save({ session });

        // 6. OPTIONAL: transactional side-effects (kept commented as requested)
        // await this.freeTrialService.createTrialOnRegistration(
        //   doctor._id.toString(),
        //   SubscriptionOwnerType.DOCTOR,
        //   session,
        // );
      });

      // 7. OUTSIDE transaction (never put Kafka/WebSocket inside TX)
      try {
        await Promise.allSettled([
          this.notifyAdminDashboardDirect(doctor!),
          this.publishDoctorRegisteredEvent(doctor!),
        ]);
      } catch (error) {
        this.logger.error('Failed to publish Kafka event', error);
      }

      return doctor!;
    } catch (error) {
      this.logger.error(
        'Doctor registration failed, transaction aborted',
        error,
      );
      throw error;
    } finally {
      await session.endSession();
    }
  }

  // Login

  async loginDoctor(dto: DoctorLoginDto): Promise<DoctorDocument> {
    if (!dto.phone || !dto.password) {
      throw new BadRequestException('رقم الهاتف وكلمة المرور مطلوبان');
    }

    const session = await this.doctorModel.db.startSession();
    let doctor: DoctorDocument | null = null;

    try {
      session.startTransaction();

      doctor = await this.doctorModel
        .findOne({
          phones: {
            $elemMatch: {
              normal: dto.phone,
            },
          },
        })
        .select('+password')
        .session(session)
        .exec();

      if (!doctor) {
        throw new UnauthorizedException('رقم الهاتف أو كلمة مرور غير صحيحة');
      }

      // Check approval status
      if (doctor.status !== ApprovalStatus.APPROVED) {
        throw new UnauthorizedException(
          'لم يتم تفعيل حسابك بعد. يرجى انتظار موافقة الإدارة',
        );
      }

      if (doctor.lockedUntil && doctor.lockedUntil.getTime() > Date.now()) {
        const unlockDate = doctor.lockedUntil.toLocaleString('ar-SY', {
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
      const passwordValid = await doctor.comparePassword?.(dto.password);

      if (!passwordValid) {
        // Increment and save failed attempts
        doctor.incrementFailedAttempts?.();
        await doctor.save({ session });
        await session.commitTransaction();

        // Throw error AFTER committing
        throw new UnauthorizedException('رقم الهاتف أو كلمة مرور غير صحيحة');
      }
      const activeSessionsCount = doctor.getActiveSessionsCount?.();
      const maxSessions = doctor.maxSessions || 5;

      if (activeSessionsCount && activeSessionsCount >= maxSessions) {
        await doctor.save({ session });
        await session.commitTransaction();
        throw new UnauthorizedException(
          `لقد تجاوزت الحد الأقصى للجلسات النشطة (${maxSessions} ${maxSessions === 1 ? 'جلسة' : 'جلسات'}). يرجى تسجيل الخروج من جهاز آخر أولاً`,
        );
      }
      // Success: Reset failed attempts
      doctor.resetFailedAttempts?.();
      doctor.lastLoginAt = new Date();

      await doctor.save({ session });
      await session.commitTransaction();

      return doctor;
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

  async requestPasswordResetOtp(dto: RequestDoctorPasswordResetDto) {
    const session = await this.connection.startSession();

    try {
      session.startTransaction();

      const { phone } = dto;

      // Check if doctor exists with this phone number
      const doctor = await this.doctorModel
        .findOne({
          phones: {
            $elemMatch: {
              normal: phone,
            },
          },
        })
        .session(session)
        .exec();

      if (!doctor) {
        throw new NotFoundException('لا يوجد حساب طبيب مسجل بهذا الرقم');
      }

      // Check if doctor is approved
      if (doctor.status !== ApprovalStatus.APPROVED) {
        throw new BadRequestException(
          'حسابك غير مفعل. لا يمكن إعادة تعيين كلمة المرور',
        );
      }

      // Clear any existing OTP for this doctor
      await this.otpModel
        .deleteMany({ authAccountId: doctor.authAccountId })
        .session(session);

      // Generate new OTP
      const otp = this.smsService.generateOTP();

      await this.otpModel.create(
        [
          {
            authAccountId: doctor.authAccountId,
            phone,
            code: otp,
            expiresAt: new Date(Date.now() + 10 * 60 * 1000),
            isUsed: false,
            attempts: 0,
          },
        ],
        { session },
      );

      await session.commitTransaction();

      // Send OTP via SMS (outside transaction)
      await this.smsService.sendOTP(phone, otp);

      return {
        success: true,
        message: 'تم إرسال رمز التحقق إلى رقم هاتفك',
      };
    } catch (error) {
      if (session.inTransaction()) {
        await session.abortTransaction();
      }
      throw error;
    } finally {
      await session.endSession();
    }
  }

  async verifyPasswordResetOtp(dto: VerifyOtpForPasswordResetDto) {
    const session = await this.connection.startSession();

    try {
      session.startTransaction();

      const { phone, otp } = dto;

      // Find doctor
      const doctor = await this.doctorModel
        .findOne({
          phones: {
            $elemMatch: {
              normal: phone,
            },
          },
        })
        .session(session)
        .exec();

      if (!doctor) {
        throw new NotFoundException('لا يوجد حساب طبيب مسجل بهذا الرقم');
      }

      // Find OTP record
      const authAccount = await this.authModel.findOne({ phones: phone });

      if (!authAccount) throw new NotFoundException('Auth account not found');

      const otpRecord = await this.otpModel.findOne({
        authAccountId: authAccount._id,
        phone,
      });

      if (!otpRecord) {
        throw new UnauthorizedException('لم يتم العثور على رمز تحقق صالح');
      }

      // Check if expired
      if (otpRecord.isExpired()) {
        throw new UnauthorizedException('رمز التحقق منتهي الصلاحية');
      }

      // Check max attempts before incrementing
      if (otpRecord.isMaxAttemptsReached()) {
        throw new UnauthorizedException(
          'تجاوزت الحد الأقصى من المحاولات. يرجى طلب رمز جديد',
        );
      }

      // Check if OTP matches
      if (otpRecord.code !== otp) {
        // Increment attempts on wrong OTP
        otpRecord.incrementAttempts();
        await otpRecord.save({ session });
        await session.commitTransaction();

        const remainingAttempts =
          (otpRecord.maxAttempts || 5) - otpRecord.attempts;
        throw new UnauthorizedException(
          `رمز التحقق غير صحيح. المحاولات المتبقية: ${remainingAttempts}`,
        );
      }

      await session.commitTransaction();

      return {
        success: true,
        message: 'تم التحقق من الرمز بنجاح',
      };
    } catch (error) {
      if (session.inTransaction()) {
        await session.abortTransaction();
      }
      throw error;
    } finally {
      await session.endSession();
    }
  }

  async resetPassword(dto: ResetDoctorPasswordDto) {
    const session = await this.connection.startSession();

    try {
      session.startTransaction();

      const { phone, otp, newPassword } = dto;

      // Find doctor
      const doctor = await this.doctorModel
        .findOne({
          phones: {
            $elemMatch: {
              normal: phone,
            },
          },
        })
        .select('+password')
        .session(session)
        .exec();

      if (!doctor) {
        throw new NotFoundException('لا يوجد حساب طبيب مسجل بهذا الرقم');
      }

      // Find and verify OTP
      const authAccount = await this.authModel.findOne({ phones: phone });

      if (!authAccount) throw new NotFoundException('Auth account not found');

      const otpRecord = await this.otpModel.findOne({
        authAccountId: authAccount._id,
        phone,
      });

      if (!otpRecord) {
        throw new UnauthorizedException('لم يتم العثور على رمز تحقق صالح');
      }

      // Check expiration
      if (otpRecord.isExpired()) {
        throw new UnauthorizedException('رمز التحقق منتهي الصلاحية');
      }

      // Check max attempts (optional)
      if (otpRecord.isMaxAttemptsReached()) {
        throw new UnauthorizedException(
          'تجاوزت الحد الأقصى من المحاولات. يرجى طلب رمز جديد',
        );
      }
      if (otpRecord.code !== otp) {
        otpRecord.incrementAttempts();
        await otpRecord.save({ session });
        await session.commitTransaction();
        throw new UnauthorizedException('رمز التحقق غير صحيح');
      }

      // Update password (pre-save hook will hash it)
      doctor.password = newPassword;

      // Reset security fields
      doctor.resetFailedAttempts?.();
      doctor.lastLoginAt = new Date();

      // Optionally: clear all sessions to force re-login on all devices
      await doctor.removeAllSessions?.();

      await doctor.save({ session });

      // Mark OTP as used
      otpRecord.isUsed = true;
      await otpRecord.save({ session });

      // Delete all other OTPs for this doctor
      await this.otpModel
        .deleteMany({
          authAccountId: authAccount._id,
          _id: { $ne: otpRecord._id },
        })
        .session(session);

      await session.commitTransaction();

      return {
        success: true,
        message: 'تم إعادة تعيين كلمة المرور بنجاح',
      };
    } catch (error) {
      if (session.inTransaction()) {
        await session.abortTransaction();
      }
      throw error;
    } finally {
      await session.endSession();
    }
  }
  // ============================================
  // File Processing Methods
  // ============================================

  /**
   * Check if a doctor exists by NORMAL phone number
   * and is APPROVED
   */
  async isApprovedDoctorByPhone(
    phone: string,
  ): Promise<{ exists: boolean; approved: boolean }> {
    const doctor = await this.doctorModel
      .findOne({
        'phones.normal': phone,
      })
      .select({ approvalStatus: 1 })
      .lean()
      .exec();

    if (!doctor) {
      return {
        exists: false,
        approved: false,
      };
    }

    return {
      exists: true,
      approved: true,
    };
  }

  /**
   * Process uploaded files and return file paths
   */
  private processUploadedFiles(files?: {
    certificateImage?: Express.Multer.File;
    licenseImage?: Express.Multer.File;
    certificateDocument?: Express.Multer.File;
    licenseDocument?: Express.Multer.File;
  }): {
    certificateImage?: string;
    licenseImage?: string;
    certificateDocument?: string;
    licenseDocument?: string;
  } {
    if (!files) return {};

    const processedFiles: {
      certificateImage?: string;
      licenseImage?: string;
      certificateDocument?: string;
      licenseDocument?: string;
    } = {};

    // Process certificate files (prefer image over document if both provided)
    if (files.certificateImage) {
      processedFiles.certificateImage = this.normalizeFilePath(
        files.certificateImage.path,
      );
    } else if (files.certificateDocument) {
      processedFiles.certificateImage = this.normalizeFilePath(
        files.certificateDocument.path,
      );
    }

    // Process license files (prefer image over document if both provided)
    if (files.licenseImage) {
      processedFiles.licenseImage = this.normalizeFilePath(
        files.licenseImage.path,
      );
    } else if (files.licenseDocument) {
      processedFiles.licenseImage = this.normalizeFilePath(
        files.licenseDocument.path,
      );
    }

    return processedFiles;
  }

  /**
   * Normalize file path for cross-platform compatibility
   */
  private normalizeFilePath(filePath: string): string {
    return filePath.replace(/\\/g, '/');
  }

  // ============================================
  // Kafka Event Publishing
  // ============================================

  /**
   * Publish DOCTOR_REGISTERED event to Kafka
   * This triggers:
   * 1. Notification Service → Send welcome email/SMS
   * 2. WebSocket Service → Notify admin dashboard
   * 3. Analytics Service → Track registration
   */
  private async publishDoctorRegisteredEvent(
    doctor: DoctorDocument,
  ): Promise<void> {
    const event = {
      eventType: 'DOCTOR_REGISTERED',
      timestamp: new Date(),
      data: {
        doctorId: doctor._id.toString(),
        fullName: `${doctor.firstName} ${doctor.middleName} ${doctor.lastName}`,
        phone: doctor.phones
          .map((p) => p.normal || p.clinic || p.whatsup)
          .flat()
          .join(', '),
        // ... rest of data
      },
      metadata: {
        source: 'registration-service',
        version: '1.0',
      },
    };

    try {
      // Use emit for fire-and-forget events
      await this.kafkaProducer.emit(KAFKA_TOPICS.DOCTOR_REGISTERED, event);
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Failed to publish event: ${err.message}`);
    }
  }
  /**
   * Extract a valid phone number from doctor phones array
   * @param phones Array of phone objects
   * @returns Valid phone number string or default if none found
   */

  private async notifyAdminDashboardDirect(
    doctor: DoctorDocument,
  ): Promise<void> {
    let savedNotification: Notification | null = null;

    // 1️⃣ Persist notification (source of truth)
    try {
      savedNotification = await this.notificationModel.create({
        recipientType: UserRole.ADMIN,
        recipientId: undefined,
        Notificationtype: NotificationTypes.NewDoctorRegistration,
        title: 'New Doctor Registration Pending',
        message: `Dr. ${doctor.firstName} ${doctor.lastName} submitted a new registration.`,
        status: NotificationStatus.PENDING,
        isRead: false,
      });
    } catch (error) {
      this.logger.error(
        'Failed to persist admin notification',
        error instanceof Error ? error.stack : undefined,
      );
      return; // no point broadcasting without DB record
    }

    // 2️⃣ Build realtime payload
    const payload = {
      event: 'new-registration-pending',
      data: {
        notificationId: savedNotification._id.toString(),
        type: 'NEW_DOCTOR_REGISTRATION',
        priority: 'high',
        timestamp: new Date(),
        doctor: {
          id: doctor._id.toString(),
          fullName: `${doctor.firstName} ${doctor.middleName} ${doctor.lastName}`,
          phone: doctor.phones
            .map((p) => p.normal || p.clinic || p.whatsup)
            .flat()
            .join(', '),
          gender: doctor.gender,
          certificateImage: doctor.certificateImage,
          licenseImage: doctor.licenseImage,
          status: doctor.status,
          registeredAt: doctor.registeredAt,
        },
        actions: [
          {
            label: 'Review Now',
            type: 'primary',
            url: `/admin/doctors/pending/${doctor._id.toString()}`,
          },
          {
            label: 'View Certificate',
            type: 'secondary',
            url: doctor.certificateImage,
            openInNewTab: true,
          },
          {
            label: 'View License',
            type: 'secondary',
            url: doctor.licenseImage,
            openInNewTab: true,
          },
          {
            label: 'View Certificate Document',
            type: 'secondary',
            url: doctor.certificateDocument,
            openInNewTab: true,
          },
          {
            label: 'View License Document',
            type: 'secondary',
            url: doctor.licenseDocument,
            openInNewTab: true,
          },
        ],
      },
    };

    // 3️⃣ Broadcast WebSocket
    try {
      await firstValueFrom(
        this.httpService.post(
          `${this.SOCKET_SERVICE_URL}/notifications/admin/broadcast`,
          payload,
          {
            timeout: 3000,
            headers: {
              'Content-Type': 'application/json',
              'X-Source': 'home-service',
            },
          },
        ),
      );

      this.logger.log(`⚡ FAST: Admin notification broadcasted to admins)`);

      // 4️⃣ Mark as DELIVERED (only on success)
      await this.notificationModel.updateOne(
        { _id: savedNotification._id },
        {
          $set: {
            status: NotificationStatus.DELIVERED,
          },
        },
      );
    } catch (error) {
      this.logger.warn(
        'Realtime notification failed; notification remains PENDING',
        error instanceof Error ? error.message : undefined,
      );
      // intentionally NOT updating status → retryable
    }
  }

  // ============================================
  // Helper Methods
  // ============================================

  /**
   * Get all pending registrations (for admin)
   */
  // async getPendingRegistrations(
  //   page: number = 1,
  //   limit: number = 20,
  // ): Promise<{
  //   doctors: DoctorDocument[];
  //   total: number;
  //   page: number;
  //   totalPages: number;
  // }> {
  //   const skip = (page - 1) * limit;

  //   const [doctors, total] = await Promise.all([
  //     this.doctorModel
  //       .find({ status: DoctorStatus.PENDING })
  //       .sort({ registeredAt: -1 })
  //       .skip(skip)
  //       .limit(limit)
  //       .lean(),
  //     this.doctorModel.countDocuments({ status: DoctorStatus.PENDING }),
  //   ]);

  //   return {
  //     doctors: doctors as DoctorDocument[],
  //     total,
  //     page,
  //     totalPages: Math.ceil(total / limit),
  //   };
  // }
}
