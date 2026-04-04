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
  SlotStatus,
  UserRole,
} from '@app/common/database/schemas/common.enums';
import { Connection } from 'mongoose';
// import { FreeTrialService } from './free-trial.service';
// import { SubscriptionOwnerType } from '../schemas/subscription.schema';
import { ClientSession } from 'mongoose';
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
import { formatDate, getSyriaDate } from '@app/common/utils/get-syria-date';
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
import {
  BookingCompletionResponseDto,
  DoctorCompleteBookingDto,
} from './dto/complete-booking.dto';

import {
  DoctorPatientStatsDto,
  GenderBreakdownDto,
} from './dto/doctor-patient-stats.dto';
import type { UploadResult } from '@app/common/file-storage';
import { invalidateBookingCaches } from '@app/common/utils/cache-invalidation.util';

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
  private readonly STATS_CACHE_TTL = 86400;
  constructor(
    @InjectModel(Doctor.name) private doctorModel: Model<DoctorDocument>,
    @InjectModel(Otp.name) private otpModel: Model<OtpDocument>,
    @InjectModel(AppointmentSlot.name)
    private slotModel: Model<AppointmentSlotDocument>,
    @InjectModel(AuthAccount.name) private authModel: Model<AuthAccount>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(Booking.name) private bookingModel: Model<BookingDocument>,
    private kafkaProducer: KafkaService,
    private readonly smsService: SmsService,
    private readonly cacheManager: CacheService,
    @InjectQueue('pause-slots') private pauseSlotsQueue: Queue,
    @InjectQueue('vip-booking') private vipBookingQueue: Queue,
    @InjectQueue('holiday-block') private holidayQueue: Queue,
  ) {}

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
  ): Promise<DoctorDocument> {
    this.logger.log(`Registration attempt: ${dto.phone}`);

    const session = await this.connection.startSession();

    try {
      let doctor: DoctorDocument | undefined;

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

        // 4. Create doctor entity
        doctor = new this.doctorModel({
          firstName: dto.firstName,
          middleName: dto.middleName,
          lastName: dto.lastName,
          latitude: dto.doctorLat,
          longitude: dto.doctorLng,
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

      if (doctor) {
        try {
          const phone = doctor.phones?.[0]?.normal?.[0];
          const doctorName = `${doctor.firstName} ${doctor.lastName}`;

          this.kafkaProducer.emit(KAFKA_TOPICS.WHATSAPP_DOCTOR_WELCOME, {
            phone,
            doctorName,
          });
        } catch (error) {
          this.logger.error('Failed to publish Kafka event', error);
        }
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
  async updateDoctorFiles(
    doctorId: string,
    files: {
      certificateImage?: UploadResult;
      licenseImage?: UploadResult;
      certificateDocument?: UploadResult;
      licenseDocument?: UploadResult;
    },
  ): Promise<void> {
    this.logger.log(`Updating doctor ${doctorId} with uploaded file URLs`);

    const updateData: any = {
      updatedAt: new Date(),
    };

    // Build documents object
    const documents: any = {};

    if (files.certificateImage) {
      documents.certificateImage = files.certificateImage.url;
      documents.certificateImageFileName = files.certificateImage.fileName;
      documents.certificateImageBucket = files.certificateImage.bucket;
    }

    if (files.licenseImage) {
      documents.licenseImage = files.licenseImage.url;
      documents.licenseImageFileName = files.licenseImage.fileName;
      documents.licenseImageBucket = files.licenseImage.bucket;
    }

    if (files.certificateDocument) {
      documents.certificateDocument = files.certificateDocument.url;
      documents.certificateDocumentFileName =
        files.certificateDocument.fileName;
      documents.certificateDocumentBucket = files.certificateDocument.bucket;
    }

    if (files.licenseDocument) {
      documents.licenseDocument = files.licenseDocument.url;
      documents.licenseDocumentFileName = files.licenseDocument.fileName;
      documents.licenseDocumentBucket = files.licenseDocument.bucket;
    }

    updateData.documents = documents;

    await this.doctorModel.findByIdAndUpdate(doctorId, updateData).exec();

    this.logger.log(`Doctor ${doctorId} files updated successfully`);
  }

  /**
   * Delete doctor record (cleanup on failed registration)
   */
  async deleteDoctorRecord(doctorId: string): Promise<void> {
    this.logger.log(`Deleting doctor record: ${doctorId}`);

    if (!Types.ObjectId.isValid(doctorId)) {
      this.logger.warn(`Invalid doctor ID for deletion: ${doctorId}`);
      return;
    }

    await this.doctorModel.findByIdAndDelete(doctorId).exec();

    this.logger.log(`Doctor record deleted: ${doctorId}`);
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
      this.kafkaProducer.emit(KAFKA_TOPICS.WHATSAPP_SEND_OTP, {
        phone,
        otp,
        lang: 'ar',
      });

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
    // TransientTransactionError (code 112) means a write conflict was detected
    // by the storage engine while another operation held a lock on the same
    // document (e.g. concurrent login updating lastLoginAt).  MongoDB marks it
    // as safe to retry the entire transaction from scratch.
    const MAX_RETRIES = 3;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      const session = await this.connection.startSession();
      let shouldRetry = false;

      try {
        session.startTransaction();

        const { phone, otp, newPassword } = dto;

        const doctor = await this.doctorModel
          .findOne({ phones: { $elemMatch: { normal: phone } } })
          .select('+password')
          .session(session)
          .exec();

        if (!doctor)
          throw new NotFoundException('لا يوجد حساب طبيب مسجل بهذا الرقم');

        // All reads use the same session so they share the transaction snapshot
        // and MongoDB can detect version conflicts on every document we touch.
        const authAccount = await this.authModel
          .findOne({ phones: phone })
          .session(session);

        if (!authAccount) throw new NotFoundException('Auth account not found');

        const otpRecord = await this.otpModel
          .findOne({ authAccountId: authAccount._id, phone })
          .session(session);

        if (!otpRecord)
          throw new UnauthorizedException('لم يتم العثور على رمز تحقق صالح');

        if (otpRecord.isExpired())
          throw new UnauthorizedException('رمز التحقق منتهي الصلاحية');

        if (otpRecord.isMaxAttemptsReached())
          throw new UnauthorizedException(
            'تجاوزت الحد الأقصى من المحاولات. يرجى طلب رمز جديد',
          );

        if (otpRecord.code !== otp) {
          otpRecord.incrementAttempts();
          await otpRecord.save({ session });
          await session.commitTransaction();
          throw new UnauthorizedException('رمز التحقق غير صحيح');
        }

        doctor.password = newPassword;
        doctor.resetFailedAttempts?.();
        doctor.lastLoginAt = new Date();
        await doctor.removeAllSessions?.();
        await doctor.save({ session });

        otpRecord.isUsed = true;
        await otpRecord.save({ session });

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

        const labels: string[] =
          error?.errorLabels ?? error?.errorResponse?.errorLabels ?? [];
        const isTransient = labels.includes('TransientTransactionError');

        if (isTransient && attempt < MAX_RETRIES) {
          shouldRetry = true;
          this.logger.warn(
            `WriteConflict on resetPassword attempt ${attempt}/${MAX_RETRIES} — retrying`,
          );
        } else {
          throw error;
        }
      } finally {
        await session.endSession();
      }

      if (shouldRetry) {
        // Exponential backoff: 50 ms, 100 ms between retries
        await new Promise((r) => setTimeout(r, attempt * 50));
      }
    }

    throw new Error(
      'resetPassword failed after maximum retries due to persistent write conflicts',
    );
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
  async doctorCancelBooking(
    dto: DoctorCancelBookingDto,
    doctorId: string,
  ): Promise<{
    message: string;
    bookingId: string;
    slotId: string;
    patientNotified?: boolean;
  }> {
    const doctor = await this.doctorModel.findById(doctorId).exec();
    if (!doctor) {
      throw new NotFoundException(`Doctor with ID ${doctorId} not found`);
    }
    this.logger.log(`Doctor ${doctorId} canceling booking ${dto.bookingId}`);

    // Validate IDs
    if (!Types.ObjectId.isValid(dto.bookingId)) {
      throw new BadRequestException('Invalid booking ID');
    }
    if (!Types.ObjectId.isValid(doctorId)) {
      throw new BadRequestException('Invalid doctor ID');
    }

    const session = await this.bookingModel.db.startSession();
    session.startTransaction();

    try {
      // Step 1: Find and cancel the booking
      const booking = await this.bookingModel
        .findOne({
          _id: new Types.ObjectId(dto.bookingId),
          doctorId: new Types.ObjectId(doctorId),
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

      // Step 4: Publish Kafka event to refresh available slots
      this.publishSlotsRefreshedEvent(doctorId, slot);

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
        doctorId,
        doctorName,
        patient,
        booking,
        dto.reason,
        'DOCTOR_CANCELLED',
      );
      await invalidateBookingCaches(
        this.cacheManager,
        doctorId,
        patient._id.toString(),
        this.logger,
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
  async checkPauseConflicts(
    dto: PauseSlotsDto,
    doctorId: string,
  ): Promise<PauseSlotConflictDto> {
    this.logger.log(`Checking pause conflicts for ${dto.slotIds.length} slots`);

    // Validate doctor ID
    if (!Types.ObjectId.isValid(doctorId)) {
      throw new BadRequestException('Invalid doctor ID');
    }
    const doctor = await this.doctorModel.findById(doctorId).exec();
    if (!doctor) {
      throw new NotFoundException(`Doctor with ID ${doctorId} not found`);
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
        doctorId: new Types.ObjectId(doctorId),
        // Add this condition to exclude blocked and invalidated slots
        status: { $nin: [SlotStatus.BLOCKED, SlotStatus.INVALIDATED] },
      })
      .exec();

    if (slots.length === 0) {
      throw new NotFoundException('No valid slots found');
    }

    if (slots.length !== dto.slotIds.length) {
      throw new BadRequestException(
        `Some slots not found or don't belong to doctor ${doctorId}`,
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
  async pauseSlots(
    dto: PauseSlotsDto,
    doctorId: string,
  ): Promise<{
    message: string;
    slotsCount: number;
    affectedBookings: number;
    jobId: string;
  }> {
    this.logger.log(`Pausing ${dto.slotIds.length} slots`);

    // Validate
    if (!Types.ObjectId.isValid(doctorId)) {
      throw new BadRequestException('Invalid doctor ID');
    }

    // Get doctor info
    const doctor = await this.doctorModel.findById(doctorId).exec();
    if (!doctor) {
      throw new NotFoundException(`Doctor with ID ${doctorId} not found`);
    }

    // Check conflicts
    const conflicts = await this.checkPauseConflicts(dto, doctorId);

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
        doctorId: doctorId,
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

  async getAllSlots(
    doctorId: string,
    dto: GetAllSlotsDto,
  ): Promise<AllSlotsResponseDto[]> {
    if (!dto.date && !dto.dayName) {
      throw new BadRequestException('Either date or dayName must be provided');
    }

    if (!Types.ObjectId.isValid(doctorId)) {
      throw new BadRequestException('Invalid doctor ID');
    }

    // Cache key differs per filter type
    const cacheKey = dto.date
      ? `slots:available:${doctorId}:date:${dto.date}`
      : `slots:available:${doctorId}:day:${dto.dayName}`;

    const cached = await this.cacheManager.get<AllSlotsResponseDto[]>(cacheKey);
    if (cached) {
      this.logger.debug(`Slots cache hit: ${cacheKey}`);
      return cached;
    }

    this.logger.debug(`Slots cache miss: ${cacheKey}`);

    const doctor = await this.doctorModel.findById(doctorId).exec();
    if (!doctor) {
      throw new NotFoundException('Doctor not found');
    }

    // Build query dynamically
    const query: Record<string, any> = {
      doctorId: new Types.ObjectId(doctorId),
      status: { $ne: SlotStatus.INVALIDATED },
    };

    if (dto.date) {
      const date = new Date(dto.date);
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      query.date = { $gte: startOfDay, $lte: endOfDay };
    } else if (dto.dayName) {
      query.dayOfWeek = dto.dayName;

      // Optionally: only future slots when filtering by day name
      query.date = { $gte: new Date() };
    }

    this.logger.log(
      `Getting slots for doctor ${doctorId} — ${dto.date ? `date: ${dto.date}` : `day: ${dto.dayName}`}`,
    );

    const slots = await this.slotModel
      .find(query)
      .sort({ date: 1, startTime: 1 }) // sort by date first when querying by day
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

      if (slot.status === SlotStatus.BOOKED) {
        const booking = await this.bookingModel
          .findOne({ slotId: slot._id })
          .populate<{ patientId: User }>('patientId', 'username phone')
          .lean()
          .exec();

        if (booking && typeof booking.patientId !== 'string') {
          const patient = booking.patientId as unknown as User;
          slotData.existingBooking = {
            bookingId: booking._id.toString(),
            patientId: patient._id.toString(),
            patientName: patient.username,
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

    await this.cacheManager.set(cacheKey, slotsWithBookings, 60, 7200);
    return slotsWithBookings;
  }

  /**
   * Check VIP booking conflict (dry run)
   */
  async checkVIPBookingConflict(
    dto: CheckVIPBookingConflictDto,
    doctorId: string,
  ): Promise<VIPBookingConflictResponseDto> {
    this.logger.log(`Checking VIP booking conflict for slot ${dto.slotId}`);

    // Validate IDs
    if (!Types.ObjectId.isValid(doctorId)) {
      throw new BadRequestException('Invalid doctor ID');
    }
    if (!Types.ObjectId.isValid(dto.slotId)) {
      throw new BadRequestException('Invalid slot ID');
    }
    const doctor = await this.doctorModel.findById(doctorId).exec();
    if (!doctor) {
      throw new NotFoundException('Doctor not found');
    }

    // Get slot
    const slot = await this.slotModel
      .findOne({
        _id: new Types.ObjectId(dto.slotId),
        status: { $nin: [SlotStatus.INVALIDATED] },
        doctorId: new Types.ObjectId(doctorId),
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
  async createVIPBooking(
    dto: CreateVIPBookingDto,
    doctorId: string,
  ): Promise<{
    message: string;
    bookingId?: string;
    jobId?: string;
    willDisplaceBooking: boolean;
  }> {
    this.logger.log(`Creating VIP booking for slot ${dto.slotId}`);

    // Check conflict first
    const conflict = await this.checkVIPBookingConflict(
      {
        slotId: dto.slotId,
      },
      doctorId,
    );

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
    const doctor = await this.doctorModel.findById(doctorId).exec();
    if (!doctor) {
      throw new NotFoundException('Doctor not found');
    }

    const doctorName = `${doctor.firstName} ${doctor.middleName} ${doctor.lastName}`;

    // Queue job
    const jobData: VIPBookingJobData = {
      doctorId: doctorId,
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
    doctorId: string,
  ): Promise<HolidayConflictResponseDto> {
    this.logger.log(
      `Checking holiday conflicts for doctor ${doctorId} from ${dto.startDate} to ${dto.endDate}`,
    );

    if (!Types.ObjectId.isValid(doctorId)) {
      throw new BadRequestException('Invalid doctor ID');
    }
    const doctor = await this.doctorModel.findById(doctorId).exec();

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
        doctorId: new Types.ObjectId(doctorId),
        date: { $gte: startDate, $lte: endDate },
        status: { $nin: [SlotStatus.BLOCKED, SlotStatus.INVALIDATED] }, // Exclude blocked + invalidated
      })
      .lean()
      .exec();

    // Get all bookings in date range (PENDING status only)
    const bookings = await this.bookingModel
      .find({
        doctorId: new Types.ObjectId(doctorId),
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
  async createHoliday(
    dto: CreateHolidayDto,
    doctorId: string,
  ): Promise<{
    message: string;
    jobId: string;
    affectedBookings: number;
    affectedSlots: number;
    dateRange: string;
  }> {
    this.logger.log(`Creating holiday for doctor ${doctorId}`);

    // Check conflicts first
    const conflict = await this.checkHolidayConflict(
      {
        startDate: dto.startDate,
        endDate: dto.endDate,
        reason: dto.reason,
      },
      doctorId,
    );

    // If conflicts and not confirmed, throw error
    if (conflict.hasConflicts && !dto.confirmHoliday) {
      throw new ConflictException(
        'Holiday period has existing bookings. Set confirmHoliday: true to proceed.',
      );
    }

    // Get doctor info
    const doctor = await this.doctorModel.findById(doctorId).exec();
    if (!doctor) {
      throw new NotFoundException('Doctor not found');
    }
    console.log(doctor);
    const doctorName = `${doctor.firstName} ${doctor.middleName} ${doctor.lastName}`;

    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);
    console.log(startDate);
    // Get all slot IDs in range
    const slots = await this.slotModel
      .find({
        doctorId: doctor._id,
        date: { $gte: startDate, $lte: endDate },
      })
      .select('_id')
      .lean()
      .exec();
    // Queue job
    const jobData: HolidayBlockJobData = {
      doctorId: doctorId,
      doctorName,
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
    console.log(slots);
    return {
      message:
        'Holiday is being created. Bookings will be cancelled and patients notified.',
      jobId: job.id.toString(),
      affectedBookings: conflict.affectedBookings.length,
      affectedSlots: slots.length,
      dateRange: `${dto.startDate} to ${dto.endDate}`,
    };
  }

  async updateDoctorFCMToken(
    doctorId: string,
    fcmToken: string,
  ): Promise<{
    message: string;
    doctorId: string;
    tokenUpdated: boolean;
  }> {
    if (!Types.ObjectId.isValid(doctorId)) {
      throw new BadRequestException('Invalid doctor ID');
    }

    if (!fcmToken || fcmToken.trim().length === 0) {
      throw new BadRequestException('FCM token is required');
    }

    const doctor = await this.doctorModel.findById(doctorId).exec();

    if (!doctor) {
      throw new NotFoundException(`Doctor with ID ${doctorId} not found`);
    }

    // Update FCM token
    doctor.fcmToken = fcmToken;
    await doctor.save();

    this.logger.log(`FCM token updated for doctor ${doctorId}`);

    return {
      message: 'FCM token updated successfully',
      doctorId: doctor._id.toString(),
      tokenUpdated: true,
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
  async completeBooking(
    dto: DoctorCompleteBookingDto,
    doctorId: string,
  ): Promise<BookingCompletionResponseDto> {
    this.logger.log(`Doctor ${doctorId} completing booking ${dto.bookingId}`);

    // Validate IDs
    if (!Types.ObjectId.isValid(dto.bookingId)) {
      throw new BadRequestException('Invalid booking ID');
    }
    if (!Types.ObjectId.isValid(doctorId)) {
      throw new BadRequestException('Invalid doctor ID');
    }

    // Find booking with patient and doctor info
    const booking = await this.bookingModel
      .findOne({
        _id: new Types.ObjectId(dto.bookingId),
        doctorId: new Types.ObjectId(doctorId),
        status: { $in: [BookingStatus.PENDING] },
      })
      .populate<{ patientId: User }>('patientId', 'username phone fcmToken')
      .populate<{ doctorId: Doctor }>('doctorId', 'firstName lastName')
      .exec();

    if (!booking) {
      throw new NotFoundException('الحجز غير موجود أو تم إنجازه مسبقاً');
    }

    // Update booking status
    booking.status = BookingStatus.COMPLETED;
    booking.completedAt = new Date();
    if (dto.notes) {
      booking.note = dto.notes;
    }
    await booking.save();

    this.logger.log(
      `✅ Booking ${dto.bookingId} completed by doctor ${doctorId}`,
    );

    // Get patient and doctor info
    const patient =
      typeof booking.patientId !== 'string'
        ? (booking.patientId as unknown as User)
        : null;
    const doctor =
      typeof booking.doctorId !== 'string'
        ? (booking.doctorId as unknown as Doctor)
        : null;

    // Send Kafka event to notification service
    let patientNotified = false;
    if (patient && doctor) {
      patientNotified = this.sendPatientNotificationViaKafka(
        booking,
        patient,
        doctor,
        dto.notes,
      );
      await invalidateBookingCaches(
        this.cacheManager,
        doctorId,
        patient._id.toString(),
        this.logger,
      );
    }
    return {
      message: 'تم إنجاز الحجز بنجاح',
      bookingId: booking._id.toString(),
      completedAt: booking.completedAt,
      patientNotified,
    };
  }

  /**
   * Send Kafka event to notification service (patient notification)
   * This will be consumed by notification service's handleBookingCompletedNotification
   */
  private sendPatientNotificationViaKafka(
    booking: any,
    patient: User,
    doctor: Doctor,
    notes?: string,
  ): boolean {
    if (!patient.fcmToken) {
      this.logger.warn(
        `Patient ${patient._id.toString()} has no FCM token. Notification will still be saved to DB.`,
      );
    }

    const event = {
      eventType: 'BOOKING_COMPLETED' as const,
      timestamp: new Date(),
      data: {
        patientId: patient._id.toString(),
        patientName: patient.username,
        doctorId: doctor._id.toString(),
        doctorName: `${doctor.firstName} ${doctor.lastName}`,
        fcmToken: patient.fcmToken || '', // Empty string if no token
        bookingId: booking._id?.toString(),
        appointmentDate: formatDate(booking.bookingDate),
        appointmentTime: booking.bookingTime,
        notes: notes || '',
        type: 'BOOKING_COMPLETED' as const,
      },
      metadata: {
        source: 'doctor-booking-service',
        version: '1.0',
      },
    };

    try {
      this.kafkaProducer.emit(KAFKA_TOPICS.BOOKING_COMPLETED, event);
      this.logger.log(
        `📨 Kafka event sent: BOOKING_COMPLETED_NOTIFICATION for patient ${patient._id.toString()}`,
      );
      return true;
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `❌ Failed to send Kafka event: ${err.message}`,
        err.stack,
      );
      return false;
    }
  }

  async getDoctorPatientGenderStats(
    doctorId: string,
  ): Promise<DoctorPatientStatsDto> {
    if (!Types.ObjectId.isValid(doctorId)) {
      throw new BadRequestException('Invalid doctor ID');
    }

    const cacheKey = `doctor:${doctorId}:patient-gender-stats`;
    const cached = await this.cacheManager.get<DoctorPatientStatsDto>(cacheKey);
    if (cached) {
      this.logger.debug(`Cache hit for gender stats: doctor ${doctorId}`);
      return cached;
    }

    return this.computeAndCacheStats(doctorId);
  }

  async computeAndCacheStats(doctorId: string): Promise<DoctorPatientStatsDto> {
    const doctor = await this.doctorModel.findById(doctorId).exec();
    if (!doctor) {
      throw new NotFoundException(`Doctor ${doctorId} not found`);
    }

    const doctorName = `${doctor.firstName} ${doctor.middleName} ${doctor.lastName}`;

    // Step 1: get all unique patient IDs that booked this doctor
    const patientIds = await this.bookingModel
      .distinct('patientId', {
        doctorId: new Types.ObjectId(doctorId),
        status: {
          $in: [BookingStatus.COMPLETED, BookingStatus.PENDING],
        },
      })
      .exec();

    const totalPatients = patientIds.length;

    if (totalPatients === 0) {
      const empty = this.buildStatsDto(doctorId, doctorName, 0, 0, 0, 0, 0);
      await this.cacheManager.set(
        `doctor:${doctorId}:patient-gender-stats`,
        empty,
        this.STATS_CACHE_TTL,
      );
      return empty;
    }

    // Step 2: aggregate gender from User collection
    const genderAggregation = await this.userModel
      .aggregate([
        {
          $match: {
            _id: { $in: patientIds },
          },
        },
        {
          $group: {
            _id: '$gender',
            count: { $sum: 1 },
          },
        },
      ])
      .exec();

    // Step 3: parse results
    let maleCount = 0;
    let femaleCount = 0;
    let unknownCount = 0;

    for (const group of genderAggregation) {
      const gender = (group._id as string)?.toLowerCase();
      if (gender === 'male') maleCount = group.count;
      else if (gender === 'female') femaleCount = group.count;
    }

    // Account for patients with no gender field at all
    const accountedFor = maleCount + femaleCount + unknownCount;
    unknownCount += totalPatients - accountedFor;

    const stats = this.buildStatsDto(
      doctorId,
      doctorName,
      totalPatients,
      maleCount,
      femaleCount,
      unknownCount,
      patientIds.length,
    );

    await this.cacheManager.set(
      `doctor:${doctorId}:patient-gender-stats`,
      stats,
      this.STATS_CACHE_TTL,
    );

    return stats;
  }

  private buildStatsDto(
    doctorId: string,
    doctorName: string,
    total: number,
    male: number,
    female: number,
    unknown: number,
    uniquePatients: number,
  ): DoctorPatientStatsDto {
    const now = new Date();
    const nextUpdate = new Date(now);
    nextUpdate.setHours(24, 0, 0, 0); // midnight tonight

    const toBreakdown = (count: number): GenderBreakdownDto => ({
      count,
      percentage:
        total > 0 ? parseFloat(((count / total) * 100).toFixed(2)) : 0,
    });

    return {
      doctorId,
      doctorName,
      totalPatients: total,
      uniquePatients,
      gender: {
        male: toBreakdown(male),
        female: toBreakdown(female),
        unknown: toBreakdown(unknown),
      },
      lastUpdated: now,
      nextUpdateAt: nextUpdate,
    };
  }
}
