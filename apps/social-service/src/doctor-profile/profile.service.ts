// profile.service.ts
import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { DoctorRepository } from './profile.repository';
import { Doctor } from '@app/common/database/schemas/doctor.schema';
import { Post } from '@app/common/database/schemas/post.schema';
import { PostStatus } from '@app/common/database/schemas/common.enums';
import {
  CITY_SUBCITY_MAP,
  UpdateDoctorProfileDto,
  UploadedProfileFiles,
} from './dto/update-doctor-profile.dto';

@Injectable()
export class DoctorProfileService {
  private readonly logger = new Logger(DoctorProfileService.name);

  constructor(
    private readonly doctorRepo: DoctorRepository,
    @InjectModel(Post.name) private readonly postModel: Model<Post>,
  ) {}

  // ── GET private profile ────────────────────────────────────────────────
  async getProfile(authAccountId: string): Promise<any> {
    const doctor = await this.doctorRepo.findByAuthAccountId(authAccountId);
    if (!doctor) throw new NotFoundException('doctor.NOT_FOUND');

    const posts = await this.postModel
      .find({ authorId: doctor._id, authorType: 'doctor' })
      .sort({ createdAt: -1 })
      .lean();

    return this.formatPrivateDoctor(doctor, posts);
  }

  // ── UPDATE profile ─────────────────────────────────────────────────────
  async updateProfile(
    authAccountId: string,
    dto: UpdateDoctorProfileDto,
    files: UploadedProfileFiles,
  ): Promise<any> {
    // 1. Validate specialization pairing
    if (dto.publicSpecialization && dto.privateSpecialization) {
      const valid = this.doctorRepo.checkPrivateSpecializationMatchesPublic(
        dto.publicSpecialization,
        dto.privateSpecialization,
      );
      if (!valid)
        throw new BadRequestException(
          'Private specialization does not match public specialization',
        );
    }

    // 2. Validate subcity belongs to selected city
    if (dto.subcity && dto.city) {
      const validSubcities = CITY_SUBCITY_MAP[dto.city] ?? [];
      if (!validSubcities.includes(dto.subcity))
        throw new BadRequestException(
          `Subcity "${dto.subcity}" does not belong to city "${dto.city}"`,
        );
    }

    // 3. Validate experience start date is not in the future
    let normalizedExperienceDate: Date | undefined;
    if (dto.experienceStartDate) {
      normalizedExperienceDate = new Date(dto.experienceStartDate);
      if (normalizedExperienceDate > new Date())
        throw new BadRequestException(
          'Experience start date cannot be in the future',
        );
    }

    // 4. Strip `normal` phones — read-only, set at registration
    const sanitizedPhones = dto.phones?.map(({ whatsup, clinic }) => ({
      ...(whatsup !== undefined && { whatsup }),
      ...(clinic !== undefined && { clinic }),
    }));

    // 5. Merge gallery: kept existing URLs + newly uploaded paths
    const keptUrls = Array.isArray(dto.gallery) ? dto.gallery : [];
    const newUploads = Array.isArray(files.galleryImages)
      ? files.galleryImages
      : [];
    const mergedGallery = [...keptUrls, ...newUploads];

    // profile.service.ts — updateProfile() payload section only
    // (everything else stays the same)

    const updatePayload: Record<string, any> = {};

    // Personal info
    if (dto.firstName !== undefined) updatePayload.firstName = dto.firstName;
    if (dto.middleName !== undefined) updatePayload.middleName = dto.middleName;
    if (dto.lastName !== undefined) updatePayload.lastName = dto.lastName;
    if (dto.gender !== undefined) updatePayload.gender = dto.gender;
    if (dto.bio !== undefined) updatePayload.bio = dto.bio;

    // Specialization
    if (dto.publicSpecialization !== undefined)
      updatePayload.publicSpecialization = dto.publicSpecialization;
    if (dto.privateSpecialization !== undefined)
      updatePayload.privateSpecialization = dto.privateSpecialization;

    // Location
    if (dto.city !== undefined) updatePayload.city = dto.city;
    if (dto.subcity !== undefined) updatePayload.subcity = dto.subcity;

    // Inspection
    if (dto.inspectionPrice !== undefined)
      updatePayload.inspectionPrice = dto.inspectionPrice;
    if (dto.inspectionDuration !== undefined)
      updatePayload.inspectionDuration = dto.inspectionDuration;

    // Schedule
    if (dto.workingHours !== undefined)
      updatePayload.workingHours = dto.workingHours;

    // Phones (normal already stripped)
    if (sanitizedPhones !== undefined) updatePayload.phones = sanitizedPhones;

    // Experience date (DB field is yearsOfExperience)
    if (normalizedExperienceDate)
      updatePayload.yearsOfExperience = normalizedExperienceDate;

    // Gallery merge
    if (mergedGallery.length) updatePayload.gallery = mergedGallery;

    // Files
    if (files.image) updatePayload.image = files.image;
    if (files.certificateImage)
      updatePayload.certificateImage = files.certificateImage;
    if (files.licenseImage) updatePayload.licenseImage = files.licenseImage;

    const doctor = await this.doctorRepo.updateByAuthAccountId(
      authAccountId,
      updatePayload as any,
    );

    if (!doctor) throw new NotFoundException('doctor.NOT_FOUND');

    const posts = await this.postModel
      .find({ authorId: doctor._id, authorType: 'doctor' })
      .sort({ createdAt: -1 })
      .lean();

    return this.formatPrivateDoctor(doctor, posts);
  }

  // ── DELETE doctor ──────────────────────────────────────────────────────
  async deleteDoctor(doctorId: string): Promise<void> {
    const deleted = await this.doctorRepo.deleteById(doctorId);
    if (!deleted) throw new NotFoundException('doctor.NOT_FOUND');
  }

  // ── GET public profile ─────────────────────────────────────────────────
  async getProfileById(doctorId: string): Promise<any> {
    const doctor = await this.doctorRepo.findById(doctorId);
    if (!doctor) throw new NotFoundException('doctor.NOT_FOUND');

    // Fire-and-forget — never block the response for a counter
    this.doctorRepo
      .incrementProfileViews(doctorId)
      .catch((err) =>
        this.logger.warn(`Failed to increment profileViews: ${err.message}`),
      );

    const posts = await this.postModel
      .find({
        authorId: doctor._id,
        authorType: 'doctor',
        status: { $in: [PostStatus.APPROVED, PostStatus.PUBLISHED] },
      })
      .sort({ createdAt: -1 })
      .lean();

    return this.formatPublicDoctor(doctor, posts);
  }

  // ── FORMAT: private (full data) ────────────────────────────────────────
  private formatPrivateDoctor(doctor: Doctor, posts: any[] = []) {
    return {
      id: doctor._id,
      fullName: [doctor.firstName, doctor.middleName, doctor.lastName]
        .filter(Boolean)
        .join(' '),
      bio: doctor.bio ?? '',
      gender: doctor.gender,
      status: doctor.status,
      city: doctor.city,
      subcity: doctor.subcity,
      publicSpecialization: doctor.publicSpecialization,
      privateSpecialization: doctor.privateSpecialization,
      experienceStartDate: doctor.yearsOfExperience ?? null,
      yearsOfExperience: this.calculateYearsOfExperience(
        doctor.yearsOfExperience,
      ),
      inspectionPrice: doctor.inspectionPrice ?? 0,
      inspectionDuration: doctor.inspectionDuration ?? 0,
      image: doctor.image ?? null,
      certificateImage: doctor.certificateImage ?? null,
      licenseImage: doctor.licenseImage ?? null,
      gallery: doctor.gallery ?? [],
      phones: doctor.phones,
      workingHours: doctor.workingHours ?? [],
      posts: posts.map((p) => ({
        id: p._id,
        content: p.content,
        images: p.images ?? [],
        status: p.status as PostStatus,
        subscriptionType: p.subscriptionType,
        createdAt: p.createdAt,
      })),
      sessions:
        doctor.sessions?.map((s) => ({
          deviceName: s.deviceName,
          lastActivityAt: s.lastActivityAt,
          isActive: s.isActive,
        })) ?? [],
      maxSessions: doctor.maxSessions,
    };
  }

  // ── FORMAT: public (safe subset only) ─────────────────────────────────
  private formatPublicDoctor(doctor: Doctor, posts: any[] = []) {
    return {
      id: doctor._id,
      fullName: [doctor.firstName, doctor.middleName, doctor.lastName]
        .filter(Boolean)
        .join(' '),
      bio: doctor.bio ?? '',
      gender: doctor.gender,
      city: doctor.city,
      subcity: doctor.subcity,
      publicSpecialization: doctor.publicSpecialization,
      privateSpecialization: doctor.privateSpecialization,
      experienceStartDate: doctor.yearsOfExperience ?? null,
      yearsOfExperience: this.calculateYearsOfExperience(
        doctor.yearsOfExperience,
      ),
      inspectionPrice: doctor.inspectionPrice ?? 0,
      inspectionDuration: doctor.inspectionDuration ?? 0,
      profileViews: doctor.profileViews ?? 0,
      image: doctor.image ?? null,
      gallery: doctor.gallery ?? [],
      phones: doctor.phones,
      workingHours: doctor.workingHours ?? [],
      posts: posts.map((p) => ({
        id: p._id,
        content: p.content,
        images: p.images ?? [],
        status: p.status as PostStatus,
        createdAt: p.createdAt,
      })),
    };
  }

  // ── HELPER ─────────────────────────────────────────────────────────────
  private calculateYearsOfExperience(startDate?: Date): number {
    if (!startDate) return 0;

    const today = new Date();
    const start = new Date(startDate);
    let years = today.getFullYear() - start.getFullYear();

    const monthDiff = today.getMonth() - start.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < start.getDate()))
      years--;

    return Math.max(0, years);
  }
}
