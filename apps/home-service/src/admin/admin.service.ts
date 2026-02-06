import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
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
  UserRole,
} from '@app/common/database/schemas/common.enums';
import { KAFKA_TOPICS } from '@app/common/kafka/events/topics';
import { KafkaService } from '@app/common/kafka/kafka.service';

@Injectable()
export class AdminService {
  constructor(
    @InjectModel(Admin.name) private adminModel: Model<Admin>,
    @InjectModel(Doctor.name) private doctorModel: Model<Doctor>,
    @InjectModel(Hospital.name) private hospitalModel: Model<Hospital>,
    @InjectModel(Center.name) private centerModel: Model<Center>,
    @InjectModel(AuthAccount.name) private authAccountModel: Model<AuthAccount>,
    private readonly logger: Logger,
    private kafkaProducer: KafkaService,
  ) {}

  // Admin Sign In
  async signIn(dto: AdminSignInDto): Promise<AdminDocument> {
    const admin = await this.adminModel.findOne({
      username: dto.username,
      phone: dto.phone,
    });

    if (!admin) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, admin.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!admin.isActive) {
      throw new UnauthorizedException('Admin account is deactivated');
    }
    await this.authAccountModel.findByIdAndUpdate(admin.authAccountId, {
      lastLoginAt: new Date(),
    });

    return admin;
  }

  // async approveDoctor(
  //   doctorId: string,
  //   adminId: string,
  // ): Promise<DoctorDocument> {
  //   const session = await this.doctorModel.db.startSession();

  //   try {
  //     session.startTransaction();

  //     // 1️⃣ Load doctor inside transaction
  //     const doctor = await this.doctorModel.findById(doctorId).session(session);

  //     if (!doctor) {
  //       throw new BadRequestException('Doctor not found');
  //     }

  //     if (doctor.status !== ApprovalStatus.PENDING) {
  //       throw new BadRequestException(
  //         `Doctor is not pending. Current status: ${doctor.status}`,
  //       );
  //     }

  //     if (doctor.authAccountId) {
  //       throw new BadRequestException('Doctor already has auth account');
  //     }

  //     // 2️⃣ Extract normalized phones
  //     const normalizedPhones = [
  //       ...new Set(
  //         (doctor.phones ?? [])
  //           .flatMap((p) => p.normal ?? [])
  //           .map((p) => p.trim())
  //           .filter(Boolean),
  //       ),
  //     ];

  //     if (normalizedPhones.length === 0) {
  //       throw new BadRequestException('Doctor has no normalized phone numbers');
  //     }
  //     const existing = await this.authAccountModel
  //       .findOne({ phones: { $in: normalizedPhones } })
  //       .session(session);

  //     if (existing) {
  //       throw new BadRequestException(
  //         'One or more phone numbers already belong to another account',
  //       );
  //     }

  //     // 3️⃣ Create AuthAccount (phones copied from doctor)
  //     const [authAccount] = await this.authAccountModel.create(
  //       [
  //         {
  //           role: UserRole.DOCTOR,
  //           phones: normalizedPhones,
  //           isActive: true,
  //           tokenVersion: 0,
  //         },
  //       ],
  //       { session },
  //     );

  //     // 4️⃣ Approve doctor & link auth account
  //     doctor.status = ApprovalStatus.APPROVED;
  //     doctor.approvedBy = adminId as any;
  //     doctor.approvedAt = new Date();
  //     doctor.authAccountId = authAccount._id;

  //     await doctor.save({ session });

  //     // 5️⃣ Commit
  //     await session.commitTransaction();

  //     return doctor;
  //   } catch (error) {
  //     await session.abortTransaction();
  //     throw error;
  //   } finally {
  //     await session.endSession();
  //   }
  //   try {
  //     const results = await Promise.allSettled([
  //       this.notifyAdminDashboardDirect(approvedDoctor),
  //       this.publishDoctorRegisteredEvent(approvedDoctor, files),
  //     ]);

  //     results.forEach((r, idx) => {
  //       if (r.status === 'rejected') {
  //         this.logger.error(
  //           `Post-commit side effect #${idx + 1} failed`,
  //           r.reason,
  //         );
  //       }
  //     });
  //   } catch (error) {
  //     // ⚠️ This catch is only for unexpected Promise.allSettled failures
  //     this.logger.error(
  //       'Unexpected error during post-commit side effects',
  //       error,
  //     );
  //   }

  //   return approvedDoctor;
  // }
  //
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
        throw new BadRequestException('Doctor has no normalized phone numbers');
      }
      const existing = await this.authAccountModel
        .findOne({ phones: { $in: normalizedPhones } })
        .session(session);

      if (existing) {
        throw new BadRequestException(
          'One or more phone numbers already belong to another account',
        );
      }

      // 3️⃣ Create AuthAccount (phones copied from doctor)
      const [authAccount] = await this.authAccountModel.create(
        [
          {
            role: UserRole.DOCTOR,
            phones: normalizedPhones,
            isActive: true,
            tokenVersion: 0,
          },
        ],
        { session },
      );

      doctor.status = ApprovalStatus.APPROVED;
      doctor.approvedBy = adminId as any;
      doctor.approvedAt = new Date();
      doctor.authAccountId = authAccount._id;

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
      const err = new Error(`Failed to publish event: ${error.message}`);
      this.logger.error(err.message);
    }
  }
}
