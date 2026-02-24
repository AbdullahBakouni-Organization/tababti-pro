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
import { Model, PipelineStage, Types } from 'mongoose';
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
  BookingStatus,
  NotificationStatus,
  NotificationTypes,
  SlotStatus,
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
import {
  Booking,
  BookingDocument,
} from '@app/common/database/schemas/booking.schema';
import { GetDoctorBookingsByLocationDto } from './dto/booking-responce.dto';
import { CacheService } from '@app/common/cache/cache.service';
import {
  DoctorCancelBookingDto,
  PauseSlotConflictDto,
  PauseSlotsDto,
  PauseSlotsJobData,
} from './dto/slot-management.dto';
import {
  AppointmentSlot,
  AppointmentSlotDocument,
} from '@app/common/database/schemas/slot.schema';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { User, UserDocument } from '@app/common/database/schemas/user.schema';
import { getSyriaDate } from '@app/common/utils/get-syria-date';
import {
  AllSlotsResponseDto,
  CheckHolidayConflictDto,
  CheckVIPBookingConflictDto,
  CreateHolidayDto,
  CreateVIPBookingDto,
  GetAllSlotsDto,
  HolidayBlockJobData,
  HolidayConflictResponseDto,
  VIPBookingConflictResponseDto,
  VIPBookingJobData,
} from './dto/vibbooking.dto';
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
    @InjectModel(AppointmentSlot.name)
    private slotModel: Model<AppointmentSlotDocument>,
    @InjectModel(AuthAccount.name) private authModel: Model<AuthAccount>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(Booking.name) private bookingModel: Model<BookingDocument>,
    private kafkaProducer: KafkaService,
    private httpService: HttpService,
    private configService: ConfigService,
    private readonly smsService: SmsService,
    private readonly cacheManager: CacheService,
    @InjectQueue('pause-slots') private pauseSlotsQueue: Queue,
    @InjectQueue('vip-booking') private vipBookingQueue: Queue,
    @InjectQueue('holiday-block') private holidayQueue: Queue,
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
        .deleteMany({
          doctorId: doctor._id,
          phone: phone,
        })
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
   * 2. fcm Service → Notify admin dashboard
   * 3. Analytics Service → Track registration
   */
  private publishDoctorRegisteredEvent(doctor: DoctorDocument): void {
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
      this.kafkaProducer.emit(KAFKA_TOPICS.DOCTOR_REGISTERED, event);
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

  async getDoctorBookingsByLocation(query: GetDoctorBookingsByLocationDto) {
    const { doctorId, locationType, bookingDate, page = 1, limit = 10 } = query;

    const cacheKey = `doctor:${doctorId}:bookings:${locationType}:${bookingDate}:p${page}:l${limit}`;

    const cached = await this.cacheManager.get(cacheKey);
    if (cached) return cached;

    const skip = (page - 1) * limit;

    const selectedDate = new Date(bookingDate);
    selectedDate.setHours(0, 0, 0, 0);

    const nextDay = new Date(selectedDate);
    nextDay.setDate(selectedDate.getDate() + 1);

    const aggregation: PipelineStage[] = [
      {
        $match: {
          doctorId: new Types.ObjectId(doctorId),
          bookingDate: { $gte: selectedDate, $lt: nextDay },
        },
      },
      {
        $lookup: {
          from: 'appointment_slots',
          localField: 'slotId',
          foreignField: '_id',
          as: 'slot',
        },
      },
      { $unwind: '$slot' },
      {
        $match: {
          'slot.location.type': locationType,
        },
      },
      {
        $lookup: {
          from: 'users',
          localField: 'patientId',
          foreignField: '_id',
          as: 'patient',
        },
      },
      { $unwind: '$patient' },
      {
        $sort: {
          'slot.startTime': 1,
        },
      },
      {
        $facet: {
          data: [
            { $skip: skip },
            { $limit: limit },
            {
              $project: {
                bookingId: '$_id',
                bookingDate: 1,
                bookingStatus: '$status',
                slotStartTime: '$slot.startTime',
                slotEndTime: '$slot.endTime',
                dayOfWeek: '$slot.dayOfWeek',
                patientId: '$patient._id',
                patientName: '$patient.username',
                patientPhone: '$patient.phone',
                patientImage: '$patient.image',
              },
            },
          ],
          totalCount: [{ $count: 'count' }],
        },
      },
    ];

    const result = await this.bookingModel.aggregate(aggregation);

    const data = result[0].data;
    const total = result[0].totalCount[0]?.count || 0;

    const response = {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };

    await this.cacheManager.set(cacheKey, response, 3600);

    return response;
  }

  /**
   * Doctor cancels a booking
   * Frees up the slot and publishes Kafka event to refresh available slots
   */
  async doctorCancelBooking(dto: DoctorCancelBookingDto): Promise<{
    message: string;
    bookingId: string;
    slotId: string;
    patientNotified?: boolean;
  }> {
    const doctor = await this.doctorModel.findById(dto.doctorId).exec();
    if (!doctor) {
      throw new NotFoundException(`Doctor with ID ${dto.doctorId} not found`);
    }
    this.logger.log(
      `Doctor ${dto.doctorId} canceling booking ${dto.bookingId}`,
    );

    // Validate IDs
    if (!Types.ObjectId.isValid(dto.bookingId)) {
      throw new BadRequestException('Invalid booking ID');
    }
    if (!Types.ObjectId.isValid(dto.doctorId)) {
      throw new BadRequestException('Invalid doctor ID');
    }

    const session = await this.bookingModel.db.startSession();
    session.startTransaction();

    try {
      // Step 1: Find and cancel the booking
      const booking = await this.bookingModel
        .findOne({
          _id: new Types.ObjectId(dto.bookingId),
          doctorId: new Types.ObjectId(dto.doctorId),
          status: { $in: [BookingStatus.PENDING] },
        })
        .populate('patientId', 'username phone fcmToken')
        .session(session)
        .exec();

      if (!booking) {
        throw new NotFoundException('Booking not found or already cancelled');
      }

      // Update booking status
      booking.status = BookingStatus.CANCELLED_BY_DOCTOR;
      booking.cancellation = {
        cancelledBy: UserRole.DOCTOR,
        reason: dto.reason,
        cancelledAt: new Date(),
      };
      await booking.save({ session });

      // Step 2: Free up the slot
      const slot = await this.slotModel
        .findByIdAndUpdate(
          booking.slotId,
          { $set: { status: SlotStatus.AVAILABLE } },
          { new: true, session },
        )
        .exec();

      if (!slot) {
        throw new NotFoundException('Associated slot not found');
      }

      // Commit transaction
      await session.commitTransaction();

      this.logger.log(
        `Booking ${dto.bookingId} cancelled by doctor. Slot ${slot._id.toString()} freed.`,
      );

      // Step 3: Invalidate cache
      await this.invalidateSlotsCache(dto.doctorId);

      // Step 4: Publish Kafka event to refresh available slots
      this.publishSlotsRefreshedEvent(dto.doctorId, slot);

      // Step 5: Send FCM notification to patient

      const doctorName = doctor.firstName + ' ' + doctor.lastName;
      const patient = await this.userModel.findById(booking.patientId).exec();

      if (!patient) {
        this.logger.warn(`Patient not found. Notification not sent.`);
        return {
          message: 'Booking cancelled successfully',
          bookingId: booking._id.toString(),
          slotId: slot._id.toString(),
        };
      }

      const patientToken = patient.fcmToken;

      if (!patientToken) {
        this.logger.warn(`Patient has no FCM token. Notification not sent.`);
        return {
          message: 'Booking cancelled successfully',
          bookingId: booking._id.toString(),
          slotId: slot._id.toString(),
        };
      }

      this.sendCancellationNotification(
        dto.doctorId,
        doctorName,
        patient,
        booking,
        dto.reason,
        'DOCTOR_CANCELLED',
      );

      return {
        message: 'Booking cancelled successfully',
        bookingId: booking._id.toString(),
        slotId: slot._id.toString(),
        // patientNotified,
      };
    } catch (error) {
      const err = error as Error;
      await session.abortTransaction();
      this.logger.error(`Failed to cancel booking: ${err.message}`, err.stack);
      throw error;
    } finally {
      await session.endSession();
    }
  }

  /**
   * Publish Kafka event to notify about refreshed available slots
   */
  private publishSlotsRefreshedEvent(
    doctorId: string,
    freedSlot: AppointmentSlotDocument,
  ): void {
    const event = {
      eventType: 'SLOTS_REFRESHED',
      timestamp: new Date(),
      data: {
        doctorId,
        slotId: freedSlot._id.toString(),
        date: freedSlot.date,
        startTime: freedSlot.startTime,
        endTime: freedSlot.endTime,
        location: freedSlot.location,
        price: freedSlot.price,
      },
      metadata: {
        source: 'slot-management-service',
        version: '1.0',
      },
    };

    try {
      this.kafkaProducer.emit(KAFKA_TOPICS.SLOTS_REFRESHED, event);
      this.logger.log(`Slots refreshed event published for doctor ${doctorId}`);
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `Failed to publish slots refreshed event: ${err.message}`,
        err.stack,
      );
    }
  }

  /**
   * Check conflicts before pausing slots (dry run)
   */
  async checkPauseConflicts(dto: PauseSlotsDto): Promise<PauseSlotConflictDto> {
    this.logger.log(`Checking pause conflicts for ${dto.slotIds.length} slots`);

    // Validate doctor ID
    if (!Types.ObjectId.isValid(dto.doctorId)) {
      throw new BadRequestException('Invalid doctor ID');
    }
    const doctor = await this.doctorModel.findById(dto.doctorId).exec();
    if (!doctor) {
      throw new NotFoundException(`Doctor with ID ${dto.doctorId} not found`);
    }
    // Validate slot IDs
    for (const slotId of dto.slotIds) {
      if (!Types.ObjectId.isValid(slotId)) {
        throw new BadRequestException(`Invalid slot ID: ${slotId}`);
      }
    }

    // Get slots
    const slots = await this.slotModel
      .find({
        _id: { $in: dto.slotIds.map((id) => new Types.ObjectId(id)) },
        doctorId: new Types.ObjectId(dto.doctorId),
        // Add this condition to exclude blocked and invalidated slots
        status: { $nin: [SlotStatus.BLOCKED, SlotStatus.INVALIDATED] },
      })
      .exec();

    if (slots.length === 0) {
      throw new NotFoundException('No valid slots found');
    }

    if (slots.length !== dto.slotIds.length) {
      throw new BadRequestException(
        `Some slots not found or don't belong to doctor ${dto.doctorId}`,
      );
    }

    // Find bookings for these slots
    const bookings = await this.bookingModel
      .find({
        slotId: { $in: dto.slotIds.map((id) => new Types.ObjectId(id)) },
        status: BookingStatus.PENDING,
      })
      .populate<{ patientId: User }>('patientId', 'username phone')
      .lean()
      .exec();

    const affectedBookings = bookings.map((booking) => ({
      bookingId: booking._id.toString(),
      patientId: booking.patientId._id.toString(),
      patientName: `${booking.patientId.username}`,
      patientPhone: booking.patientId.phone,
      slotTime: `${booking.bookingTime} - ${booking.bookingEndTime}`,
    }));

    const hasConflicts = affectedBookings.length > 0;

    const response: PauseSlotConflictDto = {
      hasConflicts,
      affectedBookings,
      summary: {
        totalAffected: affectedBookings.length,
        slotsCount: slots.length,
      },
      warningMessage: hasConflicts
        ? `Pausing these slots will cancel ${affectedBookings.length} booking(s). Affected patients will be notified via push notification.`
        : undefined,
    };

    this.logger.log(
      `Pause conflict check: ${affectedBookings.length} bookings affected`,
    );

    return response;
  }

  /**
   * Pause slots and handle conflicts
   */
  async pauseSlots(dto: PauseSlotsDto): Promise<{
    message: string;
    slotsCount: number;
    affectedBookings: number;
    jobId: string;
  }> {
    this.logger.log(`Pausing ${dto.slotIds.length} slots`);

    // Validate
    if (!Types.ObjectId.isValid(dto.doctorId)) {
      throw new BadRequestException('Invalid doctor ID');
    }

    // Get doctor info
    const doctor = await this.doctorModel.findById(dto.doctorId).exec();
    if (!doctor) {
      throw new NotFoundException(`Doctor with ID ${dto.doctorId} not found`);
    }

    // Check conflicts
    const conflicts = await this.checkPauseConflicts(dto);

    if (conflicts.hasConflicts && !dto.confirmPause) {
      throw new ConflictException(
        'Conflicts detected. Set confirmPause: true to proceed.',
      );
    }

    // Determine pause date
    const pauseDate = dto.pauseDate ? new Date(dto.pauseDate) : getSyriaDate();

    // Queue job to pause slots
    const job = await this.pauseSlotsQueue.add(
      'pause-slots-and-cancel-bookings',
      {
        doctorId: dto.doctorId,
        slotIds: dto.slotIds,
        reason: dto.reason,
        pauseDate,
        affectedBookingIds: conflicts.affectedBookings.map((b) => b.bookingId),
        doctorInfo: {
          fullName: `${doctor.firstName} ${doctor.middleName} ${doctor.lastName}`,
        },
      } as PauseSlotsJobData,
      {
        priority: 1, // High priority
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      },
    );

    this.logger.log(
      `Pause slots job queued: ${job.id} for ${dto.slotIds.length} slots`,
    );

    return {
      message: conflicts.hasConflicts
        ? 'Slots are being paused. Affected patients will be notified.'
        : 'Slots are being paused. No bookings affected.',
      slotsCount: dto.slotIds.length,
      affectedBookings: conflicts.affectedBookings.length,
      jobId: job.id.toString(),
    };
  }
  private sendCancellationNotification(
    doctorId: string,
    doctorName: string,
    patient: UserDocument,
    booking: BookingDocument,
    reason: string,
    type: 'DOCTOR_CANCELLED' | 'SLOT_PAUSED',
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

    // This will be handled by FCM service (created separately)
    // For now, publish to Kafka for notification service to handle
    const event = {
      eventType: 'BOOKING_CANCELLED_NOTIFICATION',
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
        KAFKA_TOPICS.BOOKING_CANCELLED_NOTIFICATION,
        event,
      );
      this.logger.log(`Cancellation notification event published for patient `);
      return true;
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `Failed to publish cancellation notification: ${err.message}`,
      );
      return false;
    }
  }
  private async invalidateSlotsCache(doctorId: string): Promise<void> {
    try {
      // Delete all cache keys related to this doctor's slots
      const pattern = `slots:available:${doctorId}:*`;
      await this.cacheManager.del(pattern);

      this.logger.debug(`Slots cache invalidated for doctor ${doctorId}`);
    } catch (error) {
      const err = error as Error;
      this.logger.warn(`Failed to invalidate slots cache: ${err.message}`);
    }
  }

  async getAllSlots(dto: GetAllSlotsDto): Promise<AllSlotsResponseDto[]> {
    this.logger.log(
      `Getting all slots for doctor ${dto.doctorId} on ${dto.date}`,
    );

    if (!Types.ObjectId.isValid(dto.doctorId)) {
      throw new BadRequestException('Invalid doctor ID');
    }
    const doctor = await this.doctorModel.findById(dto.doctorId).exec();
    if (!doctor) {
      throw new NotFoundException('Doctor not found');
    }
    const date = new Date(dto.date);
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    // Get ALL slots (not just AVAILABLE)
    const slots = await this.slotModel
      .find({
        doctorId: new Types.ObjectId(dto.doctorId),
        status: { $ne: SlotStatus.INVALIDATED },
        date: { $gte: startOfDay, $lte: endOfDay },
      })
      .sort({ startTime: 1 })
      .lean()
      .exec();

    const slotsWithBookings: AllSlotsResponseDto[] = [];

    for (const slot of slots) {
      const slotData: AllSlotsResponseDto = {
        slotId: slot._id.toString(),
        date: slot.date,
        startTime: slot.startTime,
        endTime: slot.endTime,
        status: slot.status as any,
        location: slot.location,
      };

      // If slot is booked, get booking details
      if (slot.status === SlotStatus.BOOKED) {
        const booking = await this.bookingModel
          .findOne({ slotId: slot._id })
          .populate<{
            patientId: User;
          }>('patientId', 'username phone')
          .lean()
          .exec();

        if (booking && typeof booking.patientId !== 'string') {
          const patient = booking.patientId as unknown as User;
          slotData.existingBooking = {
            bookingId: booking._id.toString(),
            patientId: patient._id.toString(),
            patientName: `${patient.username}`,
            patientPhone: patient.phone,
            bookingStatus: booking.status,
          };
        }
      }

      slotsWithBookings.push(slotData);
    }

    this.logger.log(
      `Found ${slotsWithBookings.length} slots (${slots.filter((s) => s.status === SlotStatus.BOOKED).length} booked)`,
    );

    return slotsWithBookings;
  }

  /**
   * Check VIP booking conflict (dry run)
   */
  async checkVIPBookingConflict(
    dto: CheckVIPBookingConflictDto,
  ): Promise<VIPBookingConflictResponseDto> {
    this.logger.log(`Checking VIP booking conflict for slot ${dto.slotId}`);

    // Validate IDs
    if (!Types.ObjectId.isValid(dto.doctorId)) {
      throw new BadRequestException('Invalid doctor ID');
    }
    if (!Types.ObjectId.isValid(dto.slotId)) {
      throw new BadRequestException('Invalid slot ID');
    }
    const doctor = await this.doctorModel.findById(dto.doctorId).exec();
    if (!doctor) {
      throw new NotFoundException('Doctor not found');
    }

    // Get slot
    const slot = await this.slotModel
      .findOne({
        _id: new Types.ObjectId(dto.slotId),
        status: { $nin: [SlotStatus.INVALIDATED] },
        doctorId: new Types.ObjectId(dto.doctorId),
      })
      .exec();

    if (!slot) {
      throw new NotFoundException('Slot not found');
    }

    const response: VIPBookingConflictResponseDto = {
      hasConflict: false,
      slotStatus: slot.status as any,
      canProceed: true,
    };

    // Check slot status
    if (slot.status === SlotStatus.AVAILABLE) {
      // No conflict - slot is available
      response.hasConflict = false;
      response.canProceed = true;
      return response;
    }

    if (slot.status === SlotStatus.BLOCKED) {
      // Cannot book on paused/blocked slots
      response.hasConflict = true;
      response.canProceed = false;
      response.warningMessage = `Slot is ${slot.status}. Cannot create VIP booking.`;
      return response;
    }

    if (slot.status === SlotStatus.BOOKED) {
      // Conflict - slot already has a booking
      const existingBooking = await this.bookingModel
        .findOne({ slotId: slot._id })
        .populate<{
          patientId: User;
        }>('patientId', 'username phone')
        .exec();

      if (existingBooking && typeof existingBooking.patientId !== 'string') {
        const patient = existingBooking.patientId as unknown as User;

        response.hasConflict = true;
        response.conflictDetails = {
          existingBookingId: existingBooking._id.toString(),
          patientId: patient._id.toString(),
          patientName: patient.username,
          patientPhone: patient.phone,
          appointmentTime: `${existingBooking.bookingTime} - ${existingBooking.bookingEndTime}`,
        };
        response.warningMessage = `Slot is already booked by ${response.conflictDetails.patientName}. Creating VIP booking will CANCEL their appointment and notify them.`;
        response.canProceed = true; // Can proceed with override
      }
    }

    return response;
  }

  /**
   * Create VIP booking (execute)
   * Queues Bull job to handle conflict and notifications
   */
  async createVIPBooking(dto: CreateVIPBookingDto): Promise<{
    message: string;
    bookingId?: string;
    jobId?: string;
    willDisplaceBooking: boolean;
  }> {
    this.logger.log(`Creating VIP booking for slot ${dto.slotId}`);

    // Check conflict first
    const conflict = await this.checkVIPBookingConflict({
      doctorId: dto.doctorId,
      slotId: dto.slotId,
    });

    // If conflict and not confirmed, throw error
    if (conflict.hasConflict && !dto.confirmOverride) {
      throw new ConflictException(
        'Slot is already booked. Set confirmOverride: true to proceed.',
      );
    }

    // If slot is paused/blocked, cannot proceed
    if (!conflict.canProceed) {
      throw new BadRequestException(conflict.warningMessage);
    }

    // Get doctor info
    const doctor = await this.doctorModel.findById(dto.doctorId).exec();
    if (!doctor) {
      throw new NotFoundException('Doctor not found');
    }

    const doctorName = `${doctor.firstName} ${doctor.middleName} ${doctor.lastName}`;

    // Queue job
    const jobData: VIPBookingJobData = {
      doctorId: dto.doctorId,
      doctorName,
      slotId: dto.slotId,
      vipPatientId: dto.vipPatientId,
      existingBookingId: conflict.conflictDetails?.existingBookingId || null,
      reason: dto.reason,
      note: dto.note,
    };

    const job = await this.vipBookingQueue.add('create-vip-booking', jobData, {
      priority: 1, // High priority
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
    });

    this.logger.log(`VIP booking job queued: ${job.id}`);

    return {
      message: conflict.hasConflict
        ? 'VIP booking is being created. Existing booking will be cancelled and patient notified.'
        : 'VIP booking is being created.',
      jobId: job.id.toString(),
      willDisplaceBooking: conflict.hasConflict,
    };
  }

  async checkHolidayConflict(
    dto: CheckHolidayConflictDto,
  ): Promise<HolidayConflictResponseDto> {
    this.logger.log(
      `Checking holiday conflicts for doctor ${dto.doctorId} from ${dto.startDate} to ${dto.endDate}`,
    );

    if (!Types.ObjectId.isValid(dto.doctorId)) {
      throw new BadRequestException('Invalid doctor ID');
    }
    const doctor = await this.doctorModel.findById(dto.doctorId).exec();

    if (!doctor) {
      throw new NotFoundException('Doctor not found');
    }
    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);

    if (startDate >= endDate) {
      throw new BadRequestException('Start date must be before end date');
    }

    // Get all slots in date range
    const slots = await this.slotModel
      .find({
        doctorId: new Types.ObjectId(dto.doctorId),
        date: { $gte: startDate, $lte: endDate },
        status: { $nin: [SlotStatus.BLOCKED, SlotStatus.INVALIDATED] }, // Exclude blocked + invalidated
      })
      .lean()
      .exec();

    // Get all bookings in date range (PENDING status only)
    const bookings = await this.bookingModel
      .find({
        doctorId: new Types.ObjectId(dto.doctorId),
        bookingDate: { $gte: startDate, $lte: endDate },
        status: BookingStatus.PENDING, // Only PENDING bookings
      })
      .populate<{ patientId: User }>('patientId', 'username phone')
      .lean()
      .exec();

    // Build affected bookings list
    const affectedBookings = bookings.map((booking) => {
      const patient =
        typeof booking.patientId !== 'string'
          ? (booking.patientId as unknown as User)
          : null;

      return {
        bookingId: booking._id.toString(),
        patientId: patient?._id.toString() || '',
        patientName: patient ? `${patient.username}` : 'Unknown',
        patientPhone: patient?.phone || '',
        appointmentDate: booking.bookingDate,
        appointmentTime: booking.bookingTime,
        location: booking.location,
      };
    });

    // Get unique dates in range
    const dates = this.getDatesBetween(startDate, endDate);
    const daysCount = dates.length;

    const response: HolidayConflictResponseDto = {
      hasConflicts: affectedBookings.length > 0,
      affectedBookings,
      affectedSlots: {
        totalSlots: slots.length,
        dates: dates.map((d) => d.toISOString().split('T')[0]),
      },
      summary: {
        totalBookings: affectedBookings.length,
        totalSlots: slots.length,
        dateRange: `${dto.startDate} to ${dto.endDate}`,
        daysCount,
      },
      warningMessage:
        affectedBookings.length > 0
          ? `Creating holiday will cancel ${affectedBookings.length} pending booking(s) and block ${slots.length} slots for ${daysCount} days. All affected patients will receive push notifications.`
          : undefined,
    };

    this.logger.log(
      `Holiday conflict check: ${affectedBookings.length} bookings, ${slots.length} slots affected`,
    );

    return response;
  }

  /**
   * Create holiday (execute)
   * Queues Bull job to handle cancellations and notifications
   */
  async createHoliday(dto: CreateHolidayDto): Promise<{
    message: string;
    jobId: string;
    affectedBookings: number;
    affectedSlots: number;
    dateRange: string;
  }> {
    this.logger.log(`Creating holiday for doctor ${dto.doctorId}`);

    // Check conflicts first
    const conflict = await this.checkHolidayConflict({
      doctorId: dto.doctorId,
      startDate: dto.startDate,
      endDate: dto.endDate,
      reason: dto.reason,
    });

    // If conflicts and not confirmed, throw error
    if (conflict.hasConflicts && !dto.confirmHoliday) {
      throw new ConflictException(
        'Holiday period has existing bookings. Set confirmHoliday: true to proceed.',
      );
    }

    // Get doctor info
    const doctor = await this.doctorModel.findById(dto.doctorId).exec();
    if (!doctor) {
      throw new NotFoundException('Doctor not found');
    }

    const doctorName = `${doctor.firstName} ${doctor.middleName} ${doctor.lastName}`;

    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);

    // Get all slot IDs in range
    const slots = await this.slotModel
      .find({
        doctorId: new Types.ObjectId(dto.doctorId),
        date: { $gte: startDate, $lte: endDate },
      })
      .select('_id')
      .lean()
      .exec();
    // Queue job
    const jobData: HolidayBlockJobData = {
      doctorId: dto.doctorId,
      doctorName,
      startDate,
      endDate,
      reason: dto.reason,
      affectedBookingIds: conflict.affectedBookings.map((b) => b.bookingId),
      affectedSlotIds: slots.map((s) => s._id.toString()),
    };
    const job = await this.holidayQueue.add('block-holiday-dates', jobData, {
      priority: 1, // High priority
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
    });

    this.logger.log(`Holiday block job queued: ${job.id}`);

    return {
      message:
        'Holiday is being created. Bookings will be cancelled and patients notified.',
      jobId: job.id.toString(),
      affectedBookings: conflict.affectedBookings.length,
      affectedSlots: slots.length,
      dateRange: `${dto.startDate} to ${dto.endDate}`,
    };
  }

  private getDatesBetween(startDate: Date, endDate: Date): Date[] {
    const dates: Date[] = [];
    const currentDate = new Date(startDate);

    while (currentDate <= endDate) {
      dates.push(new Date(currentDate));
      currentDate.setDate(currentDate.getDate() + 1);
    }

    return dates;
  }
}
