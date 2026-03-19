// profile.service.ts
import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { DoctorRepository } from './profile.repository';
import { Doctor } from '@app/common/database/schemas/doctor.schema';
import { Post } from '@app/common/database/schemas/post.schema';
import {
  GalleryImageStatus,
  PostStatus,
} from '@app/common/database/schemas/common.enums';
import {
  CITY_SUBCITY_MAP,
  UpdateDoctorProfileDto,
} from './dto/update-doctor-profile.dto';
import { MinioService } from 'apps/home-service/src/minio/minio.service';
import { calculateYearsOfExperience } from '@app/common/utils/calculate-experience.util';
import { uploadDoctorProfileImage } from '@app/common/utils/upload-profile-images.util';
import { CacheService } from '@app/common/cache/cache.service';
import { invalidateMainProfileCaches } from '@app/common/utils/cache-invalidation.util';

@Injectable()
export class DoctorProfileService {
  private readonly logger = new Logger(DoctorProfileService.name);

  constructor(
    private readonly doctorRepo: DoctorRepository,
    @InjectModel(Post.name) private readonly postModel: Model<Post>,
    private minioService: MinioService,
    private readonly cacheService: CacheService,
  ) {}

  // ── GET private profile ────────────────────────────────────────────────
  async getProfile(authAccountId: string): Promise<any> {
    const doctor = await this.doctorRepo.findByAuthAccountId(authAccountId);

    if (!doctor) {
      throw new NotFoundException('doctor.NOT_FOUND');
    }

    const cacheKey = `doctor:profile:${authAccountId}`;

    // Try cache
    const cached = await this.cacheService.get<any>(cacheKey);
    if (cached) {
      this.logger?.debug?.(`Doctor profile cache hit: ${cacheKey}`);
      return cached;
    }

    const result = this.formatPrivateDoctor(doctor);

    // Memory = 1 Minute, Redis = 2 hours
    await this.cacheService.set(cacheKey, result, 60, 7200);

    return result;
  }

  // ── UPDATE profile ─────────────────────────────────────────────────────
  async updateProfile(
    authAccountId: string,
    dto: UpdateDoctorProfileDto,
    newImage: Express.Multer.File | undefined,
  ): Promise<any> {
    const doctor = await this.doctorRepo.findByAuthAccountId(authAccountId);
    if (!doctor) throw new NotFoundException('doctor.NOT_FOUND');
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
      updatePayload.experienceStartDate = normalizedExperienceDate;
    updatePayload.yearsOfExperience = calculateYearsOfExperience(
      normalizedExperienceDate,
    );

    if (newImage !== undefined && doctor.imageFileName && doctor.imageBucket) {
      try {
        await this.minioService.deleteFile(
          doctor.imageBucket,
          doctor.imageFileName,
        );
      } catch (error) {
        const err = error as Error;
        this.logger.warn(`Failed to delete old image: ${err.message}`);
      }
    }

    // Upload new image
    const uploadResult = await uploadDoctorProfileImage(
      this.minioService,
      doctor._id.toString(),
      newImage,
    );

    // Update user record
    if (uploadResult) {
      updatePayload.image = uploadResult.url;
      updatePayload.imageFileName = uploadResult.fileName;
      updatePayload.imageBucket = uploadResult.bucket;
    }
    const updatedDoctor = await this.doctorRepo.updateByAuthAccountId(
      authAccountId,
      updatePayload as any,
    );

    if (!updatedDoctor) {
      throw new NotFoundException('Doctor profile not found after update.');
    }
    await invalidateMainProfileCaches(
      this.cacheService,
      authAccountId,
      this.logger,
    );
    await this.cacheService.invalidate(
      `doctor_mobile_profile:${updatedDoctor._id.toString()}`,
    );
    return this.formatPrivateDoctor(updatedDoctor);
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

    const cacheKey = `doctors:profile:${doctor.authAccountId.toString()}`;
    const cachedDoctor = await this.cacheService.get(cacheKey);

    if (cachedDoctor) return cachedDoctor;
    // Fire-and-forget — never block the response for a counter
    this.doctorRepo
      .incrementProfileViews(doctorId)
      .catch((err) =>
        this.logger.warn(`Failed to increment profileViews: ${err.message}`),
      );

    const result = this.formatPrivateDoctor(doctor);

    await this.cacheService.set(cacheKey, result, 3600, 7200);

    return result;
  }

  async getDoctorPosts(doctorId: string, page = 1, limit = 10): Promise<any> {
    const cacheKey = `doctors:posts:${doctorId}:${page}:${limit}`;
    const cachedPosts = await this.cacheService.get(cacheKey);

    if (cachedPosts) return cachedPosts;

    const skip = (page - 1) * limit;
    const doctor = await this.doctorRepo.findById(doctorId);
    const [posts, totalPosts] = await Promise.all([
      this.postModel
        .find({
          authorId: new Types.ObjectId(doctor?.authAccountId),
          authorType: 'doctor',
          status: {
            $in: [PostStatus.APPROVED],
          },
        })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),

      this.postModel.countDocuments({
        authorId: new Types.ObjectId(doctor?.authAccountId),
        authorType: 'doctor',
      }),
    ]);

    const totalPages = Math.ceil(totalPosts / limit);
    const result = {
      posts,
      pagination: {
        page,
        limit,
        totalPosts,
        totalPages,
      },
    };

    await this.cacheService.set(cacheKey, result, 3600, 7200);

    return result;
  }
  // ── FORMAT: private (full data) ────────────────────────────────────────
  private formatPrivateDoctor(doctor: Doctor) {
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

      yearsOfExperience:
        calculateYearsOfExperience(doctor.experienceStartDate) ?? 0,
      experienceStartDate: doctor.experienceStartDate ?? null,
      inspectionPrice: doctor.inspectionPrice ?? 0,
      inspectionDuration: doctor.inspectionDuration ?? 0,

      image: doctor.image ?? null,

      phones: doctor.phones,
      workingHours: doctor.workingHours ?? [],
    };
  }

  async getDoctorGallery(doctorId: string, page = 1, limit = 10): Promise<any> {
    const doctor = await this.doctorRepo.findById(doctorId);

    if (!doctor) {
      throw new NotFoundException('Doctor not found');
    }
    const cacheKey = `doctors:gallery:${doctorId}:${page}:${limit}`;
    const cachedGallery = await this.cacheService.get(cacheKey);

    if (cachedGallery) return cachedGallery;

    const gallery = (doctor.gallery ?? []).filter(
      (img) => img.status === GalleryImageStatus.APPROVED,
    );

    const total = gallery.length;
    const totalPages = Math.ceil(total / limit);

    const startIndex = (page - 1) * limit;
    const paginatedGallery = gallery.slice(startIndex, startIndex + limit);

    const result = {
      gallery: paginatedGallery,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    };

    await this.cacheService.set(cacheKey, result, 3600, 7200);

    return result;
  }
}
