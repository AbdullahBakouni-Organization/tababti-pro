// ============================================
// Doctor Registration Service
// ============================================

import {
  Injectable,
  ConflictException,
  BadRequestException,
  Logger,
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
    @InjectConnection() private readonly connection: Connection,
    private kafkaProducer: KafkaService,
    private httpService: HttpService,
    private configService: ConfigService,
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
          this.publishDoctorRegisteredEvent(doctor!, files),
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
   * 2. WebSocket Service → Notify admin dashboard
   * 3. Analytics Service → Track registration
   */
  private async publishDoctorRegisteredEvent(
    doctor: DoctorDocument,
    files?: any,
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
      this.logger.error(`Failed to publish event: ${error.message}`);
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
      const response = await firstValueFrom(
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
   * Get doctor by ID
   */
  // async findById(id: string): Promise<DoctorDocument | null> {
  //   return this.doctorModel.findById(id);
  // }

  // /**
  //  * Get doctor by phone
  //  */
  // async findByPhone(phone: string): Promise<DoctorDocument | null> {
  //   return this.doctorModel.findOne({ phone }).select('+password');
  // }

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

  // /**
  //  * Reject doctor registration
  //  */
  // async rejectDoctor(
  //   doctorId: string,
  //   adminId: string,
  //   reason: string,
  // ): Promise<DoctorDocument> {
  //   const doctor = await this.doctorModel.findById(doctorId);

  //   if (!doctor) {
  //     throw new BadRequestException('Doctor not found');
  //   }

  //   if (doctor.status !== DoctorStatus.PENDING) {
  //     throw new BadRequestException(
  //       `Doctor is not pending. Current status: ${doctor.status}`,
  //     );
  //   }

  //   doctor.status = DoctorStatus.REJECTED;
  //   doctor.rejectedBy = adminId as any;
  //   doctor.rejectedAt = new Date();
  //   doctor.rejectionReason = reason;

  //   await doctor.save();

  //   // Publish rejection event
  //   await this.publishDoctorRejectedEvent(doctor, reason);

  //   return doctor;
  // }

  // /**
  //  * Publish DOCTOR_APPROVED event
  //  */
  // private async publishDoctorApprovedEvent(doctor: DoctorDocument) {
  //   await this.kafkaProducer.send({
  //     topic: KAFKA_TOPICS.DOCTOR_APPROVED,
  //     messages: [
  //       {
  //         key: doctor._id.toString(),
  //         value: JSON.stringify({
  //           eventType: 'DOCTOR_APPROVED',
  //           timestamp: new Date(),
  //           data: {
  //             doctorId: doctor._id.toString(),
  //             fullName: doctor.fullName,
  //             phone: doctor.phone,
  //             approvedAt: doctor.approvedAt,
  //             approvedBy: doctor.approvedBy?.toString(),
  //           },
  //         }),
  //       },
  //     ],
  //   });
  // }

  // /**
  //  * Publish DOCTOR_REJECTED event
  //  */
  // private async publishDoctorRejectedEvent(
  //   doctor: DoctorDocument,
  //   reason: string,
  // ) {
  //   await this.kafkaProducer.send({
  //     topic: KAFKA_TOPICS.DOCTOR_REJECTED,
  //     messages: [
  //       {
  //         key: doctor._id.toString(),
  //         value: JSON.stringify({
  //           eventType: 'DOCTOR_REJECTED',
  //           timestamp: new Date(),
  //           data: {
  //             doctorId: doctor._id.toString(),
  //             fullName: doctor.fullName,
  //             phone: doctor.phone,
  //             rejectedAt: doctor.rejectedAt,
  //             rejectedBy: doctor.rejectedBy?.toString(),
  //             reason,
  //           },
  //         }),
  //       },
  //     ],
  //   });
  // }
}
