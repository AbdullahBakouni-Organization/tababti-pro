// ============================================
// Doctor Registration Service
// ============================================

import {
  Injectable,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
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
import { ApprovalStatus } from '@app/common/database/schemas/common.enums';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
// import { FreeTrialService } from './free-trial.service';
// import { SubscriptionOwnerType } from '../schemas/subscription.schema';

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
  private readonly socketServiceUrl: string;

  constructor(
    @InjectModel(Doctor.name) private doctorModel: Model<DoctorDocument>,
    private kafkaProducer: KafkaService,
    private httpService: HttpService, // ✅ For direct WebSocket notification
    private configService: ConfigService,
  ) {
    this.socketServiceUrl =
      this.configService.get('SOCKET_SERVICE_URL') ||
      'http://socket-service:3001';
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

  /**
   * Check for duplicate registration (same identity + PENDING status)
   */
  private async checkDuplicatePending(
    dto: DoctorRegistrationDtoValidated,
  ): Promise<void> {
    // Check if there's a PENDING registration with same identity
    const existingPending = await this.doctorModel.findOne({
      'phones.normal': dto.phone,
      status: ApprovalStatus.PENDING,
    });

    if (existingPending) {
      throw new ConflictException(
        'A registration request with this phone number is already pending approval. ' +
          'You cannot submit a new registration until your current request is processed. ' +
          `Status: ${existingPending.status}, ` +
          `Submitted: ${existingPending?.registeredAt?.toLocaleDateString()}`,
      );
    }

    // Alternative check: Same name + pending
    const existingByName = await this.doctorModel.findOne({
      firstName: dto.firstName,
      middleName: dto.middleName,
      lastName: dto.lastName,
      status: ApprovalStatus.PENDING,
    });

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

  /**
   * Check if phone number is already registered (approved/rejected)
   */
  private async checkPhoneExists(phone: string): Promise<void> {
    const existing = await this.doctorModel.findOne({
      'phones.normal': phone,
      status: { $in: [ApprovalStatus.APPROVED, ApprovalStatus.SUSPENDED] },
    });

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

  /**
   * Register a new doctor
   */
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

    // 1. Validate nested enums
    this.validateSubcity(dto.city, dto.subcity);
    this.validateSpecialization(
      dto.publicSpecialization,
      dto.privateSpecialization,
    );

    // 2. Check for duplicates
    await this.checkPhoneExists(dto.phone);
    await this.checkDuplicatePending(dto);

    // 3. Process uploaded files
    const processedFiles = this.processUploadedFiles(files);

    // 4. Create doctor entity
    const doctor = new this.doctorModel({
      // Identity
      firstName: dto.firstName,
      middleName: dto.middleName,
      lastName: dto.lastName,
      password: dto.password, // Will be hashed by pre-save middleware
      phones: [
        {
          normal: [dto.phone],
          clinic: [],
          whatsup: [],
        },
      ],

      // Location - these need to be ObjectIds, not strings
      // city: dto.city,
      // subcity: dto.subcity,
      // cityId and subcityId will be populated by lookup service

      // Specialization - these need to be ObjectIds, not strings
      // publicSpecialization: dto.publicSpecialization,
      // privateSpecialization: dto.privateSpecialization,
      // IDs will be populated by lookup service

      // Verification Documents
      certificateImage: processedFiles.certificateImage || dto.certificateImage,
      licenseImage: processedFiles.licenseImage || dto.licenseImage,

      // Demographics
      gender: dto.gender,

      // Status
      status: ApprovalStatus.PENDING,

      // Sessions
      sessions: [],
      maxSessions: 5,

      // Security
      failedLoginAttempts: 0,
    });

    // 5. Save to database
    await doctor.save();
    this.logger.log(`Doctor registered with ID: ${doctor._id.toString()}`);

    // 6. Create FREE 6-month trial subscription
    // try {
    //   await this.freeTrialService.createTrialOnRegistration(
    //     doctor._id.toString(),
    //     SubscriptionOwnerType.DOCTOR,
    //   );
    //   this.logger.log(
    //     `Free trial subscription created for doctor: ${doctor._id}`,
    //   );
    // } catch (error) {
    //   this.logger.error(
    //     `Failed to create trial subscription: ${error.message}`,
    //     error.stack,
    //   );
    //   // Don't fail registration if subscription creation fails
    // }

    // 7. Publish Kafka event (Event-Driven Architecture)
    try {
      // await this.publishDoctorRegisteredEvent(doctor, processedFiles);
      await Promise.allSettled([
        // Fast path: Direct WebSocket (priority)
        this.notifyAdminDashboardDirect(doctor, processedFiles),

        // Reliable path: Kafka event (async, can be delayed)
        this.publishDoctorRegisteredEvent(doctor, processedFiles),
      ]);
    } catch (error) {
      this.logger.error('Failed to publish Kafka event', error);
      // Don't fail registration if event publishing fails
    }

    return doctor;
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
      this.logger.log(
        `Certificate image uploaded: ${processedFiles.certificateImage}`,
      );
    } else if (files.certificateDocument) {
      processedFiles.certificateImage = this.normalizeFilePath(
        files.certificateDocument.path,
      );
      this.logger.log(
        `Certificate document uploaded: ${processedFiles.certificateImage}`,
      );
    }

    // Process license files (prefer image over document if both provided)
    if (files.licenseImage) {
      processedFiles.licenseImage = this.normalizeFilePath(
        files.licenseImage.path,
      );
      this.logger.log(`License image uploaded: ${processedFiles.licenseImage}`);
    } else if (files.licenseDocument) {
      processedFiles.licenseImage = this.normalizeFilePath(
        files.licenseDocument.path,
      );
      this.logger.log(
        `License document uploaded: ${processedFiles.licenseImage}`,
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
    files?: {
      certificateImage?: string;
      licenseImage?: string;
      certificateDocument?: string;
      licenseDocument?: string;
    },
  ): Promise<void> {
    const event: DoctorRegisteredEvent = {
      eventType: 'DOCTOR_REGISTERED',
      timestamp: new Date(),
      data: {
        doctorId: doctor._id.toString(),
        fullName: `${doctor.firstName} ${doctor.middleName} ${doctor.lastName}`,
        phone: doctor.phones
          .map((phone) => phone.normal || phone.clinic || phone.whatsup)
          .flat()
          .join(', '),
        city: 'TBD', // Will be populated by lookup service
        subcity: 'TBD', // Will be populated by lookup service
        publicSpecialization: 'TBD', // Will be populated by lookup service
        privateSpecialization: 'TBD', // Will be populated by lookup service
        certificateImage: doctor.certificateImage,
        licenseImage: doctor.licenseImage,
        uploadedFiles: files || {},
        gender: doctor.gender,
        status: doctor.status,
        registeredAt: new Date(),
      },
      metadata: {
        source: 'registration-service',
        version: '1.0',
      },
    };

    try {
      await this.kafkaProducer.send(KAFKA_TOPICS.DOCTOR_REGISTERED, {
        key: doctor._id.toString(),
        value: JSON.stringify(event),
        headers: {
          'event-type': 'DOCTOR_REGISTERED',
          'event-version': '1.0',
        },
      });

      this.logger.log(
        `Published DOCTOR_REGISTERED event to Kafka: ${doctor._id.toString()}`,
      );
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `Failed to publish Kafka event: ${err.message}`,
        err.stack,
      );
      // Don't throw - registration should succeed even if event fails
      // Implement retry mechanism or dead letter queue
    }
  }
  private async notifyAdminDashboardDirect(
    doctor: DoctorDocument,
    files?: any,
  ): Promise<void> {
    try {
      const notification = {
        event: 'new-registration-pending',
        data: {
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
            uploadedFiles: files || {},
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
          ],
        },
      };

      // ✅ Direct HTTP POST to Socket Service
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.socketServiceUrl}/api/v1/notifications/admin/broadcast`,
          notification,
          {
            timeout: 3000, // 3 second timeout (fast fail)
            headers: {
              'Content-Type': 'application/json',
              'X-Source': 'home-service',
            },
          },
        ),
      );

      this.logger.log(
        `⚡ FAST: Sent real-time notification to admin dashboard (${response.data.recipientCount} admins)`,
      );
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `Failed to send direct notification: ${err.message}`,
        err.stack,
      );
      // Don't throw - registration should succeed even if notification fails
      // Admin can still see pending registrations via polling/refresh
    }
  }
  // async notifyMultiplePendingRegistrations(doctorIds: string[]): Promise<void> {
  //   try {
  //     const doctors = await this.doctorModel
  //       .find({ _id: { $in: doctorIds }, status: 'pending' })
  //       .lean();

  //     const notifications = doctors.map((doctor) => ({
  //       id: doctor._id.toString(),
  //       fullName: `${doctor.firstName} ${doctor.middleName} ${doctor.lastName}`,
  //       phone: doctor.phones
  //         .map((p) => p.normal || p.clinic || p.whatsup)
  //         .flat()[0],
  //       registeredAt: doctor.registeredAt,
  //     }));

  //     await firstValueFrom(
  //       this.httpService.post(
  //         `${this.socketServiceUrl}/api/v1/notifications/admin/batch`,
  //         {
  //           event: 'pending-registrations-batch',
  //           data: {
  //             type: 'BATCH_REGISTRATIONS',
  //             count: notifications.length,
  //             doctors: notifications,
  //           },
  //         },
  //         { timeout: 3000 },
  //       ),
  //     );

  //     this.logger.log(
  //       `⚡ Sent batch notification for ${notifications.length} doctors`,
  //     );
  //   } catch (error) {
  //     this.logger.error(`Failed to send batch notification: ${error.message}`);
  //   }
  // }
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
  //  * Approve doctor registration
  //  */
  // async approveDoctor(
  //   doctorId: string,
  //   adminId: string,
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

  //   doctor.status = DoctorStatus.APPROVED;
  //   doctor.approvedBy = adminId as any;
  //   doctor.approvedAt = new Date();

  //   await doctor.save();

  //   // Publish approval event
  //   await this.publishDoctorApprovedEvent(doctor);

  //   return doctor;
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
