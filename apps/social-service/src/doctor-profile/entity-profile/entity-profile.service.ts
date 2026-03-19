// entity-profile.service.ts (ENHANCED)
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Post } from '@app/common/database/schemas/post.schema';
import { CommonDepartment } from '@app/common/database/schemas/common_departments.schema';
import {
  GalleryImageStatus,
  PostStatus,
  UserRole,
} from '@app/common/database/schemas/common.enums';
import { EntityProfileRepository } from './entity-profile.repository';
import { EntityType } from '../dto/get-entity-profile.dto';
import { calculateYearsOfExperience } from '@app/common/utils/calculate-experience.util';
import { CacheService } from '@app/common/cache/cache.service';

@Injectable()
export class EntityProfileService {
  constructor(
    private readonly repo: EntityProfileRepository,
    @InjectModel(Post.name) private readonly postModel: Model<Post>,
    @InjectModel(CommonDepartment.name)
    private readonly departmentModel: Model<CommonDepartment>,
    private readonly cacheService: CacheService,
  ) {}

  async getEntityProfile(
    id: string,
    type: UserRole,
    page: number = 1,
    limit: number = 10,
  ) {
    switch (type) {
      case UserRole.DOCTOR:
        return this.getDoctorProfile(id, page, limit);
      case UserRole.HOSPITAL:
        return this.getHospitalProfile(id, page, limit);
      case UserRole.CENTER:
        return this.getCenterProfile(id, page, limit);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // DOCTOR PROFILE
  // ══════════════════════════════════════════════════════════════════════════

  private async getDoctorProfile(id: string, page: number, limit: number) {
    const cacheKey = `doctor_mobile_profile:${id}`;
    const galleryCacheKey = `doctor_mobile_profile:${id}:gallery:page${page}:limit${limit}`;

    // Try full profile cache (page-independent)
    const cachedProfile = await this.cacheService.get<any>(cacheKey);
    const cachedGallery = await this.cacheService.get<{
      data: any[];
      meta: any;
    }>(galleryCacheKey);

    if (cachedProfile && cachedGallery) {
      return { ...cachedProfile, gallery: cachedGallery };
    }

    const doctor = await this.repo.findDoctorById(id);
    if (!doctor) throw new NotFoundException('doctor.NOT_FOUND');
    await this.repo.incrementDoctorViews(id);

    const approvedGallery =
      doctor.gallery?.filter(
        (img) => img.status === GalleryImageStatus.APPROVED,
      ) ?? [];

    const galleryTotal = approvedGallery.length;
    const galleryStart = (page - 1) * limit;
    const galleryEnd = galleryStart + limit;
    const paginatedGallery = approvedGallery.slice(galleryStart, galleryEnd);

    const galleryResult = {
      data: paginatedGallery.map((img) => ({
        imageId: img.imageId,
        url: img.url,
        fileName: img.fileName,
        description: img.description || null,
        uploadedAt: img.uploadedAt,
        approvedAt: img.approvedAt || null,
      })),
      meta: {
        total: galleryTotal,
        page,
        limit,
        totalPages: Math.ceil(galleryTotal / limit),
        hasNextPage: galleryEnd < galleryTotal,
      },
    };

    const profileResult = {
      type: UserRole.DOCTOR,
      id: doctor._id,
      fullName: [doctor.firstName, doctor.middleName, doctor.lastName]
        .filter(Boolean)
        .join(' '),
      bio: doctor.bio || null,
      image: doctor.image || null,
      phones: doctor.phones,
      city: doctor.city,
      subcity: doctor.subcity,
      latitude: doctor.latitude || null,
      longitude: doctor.longitude || null,
      gender: doctor.gender,
      publicSpecialization: doctor.publicSpecialization,
      privateSpecialization: doctor.privateSpecialization,
      inspectionPrice: doctor.inspectionPrice || 0,
      inspectionDuration: doctor.inspectionDuration || 0,
      yearsOfExperience: calculateYearsOfExperience(doctor.experienceStartDate),
      experienceStartDate: doctor.experienceStartDate || null,
      rating: doctor.rating || 0,
      workingHours: doctor.workingHours || [],
      profileViews: doctor.profileViews || 0,
      isSubscribed: doctor.isSubscribed,
      insuranceCompanies: doctor.insuranceCompanies || [],
      hospitals: doctor.hospitals || [],
      centers: doctor.centers || [],
    };

    // Cache profile for 30 min, gallery page for 10 min
    await Promise.all([
      this.cacheService.set(cacheKey, profileResult, 60, 7200),
      this.cacheService.set(galleryCacheKey, galleryResult, 60, 600),
    ]);

    return { ...profileResult, gallery: galleryResult };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // HOSPITAL PROFILE (WITH DEPARTMENTS, MACHINES, OPERATIONS)
  // ══════════════════════════════════════════════════════════════════════════

  private async getHospitalProfile(id: string, page: number, limit: number) {
    const hospital = await this.repo.findHospitalById(id);
    if (!hospital) throw new NotFoundException('hospital.NOT_FOUND');

    await this.repo.incrementHospitalViews(id);

    // ── Get all posts ──────────────────────────────────────────────────────
    const posts = await this.postModel
      .find({
        authorId: hospital._id,
        authorType: 'hospital',
        status: { $in: [PostStatus.APPROVED, PostStatus.PUBLISHED] },
      })
      .sort({ createdAt: -1 })
      .lean();

    // ── Get all departments ────────────────────────────────────────────────
    const departments = await this.departmentModel
      .find({ hospitalId: new Types.ObjectId(id) })
      .lean();

    // ── Transform departments data ─────────────────────────────────────────
    const transformedDepartments = departments.map((dept) => ({
      id: dept._id?.toString(),
      type: dept.type,
      doctors: (dept.doctors || []).map((doc) => ({
        id: doc.id,
        name: doc.name,
        specialization: doc.specialization?.toString(),
      })),
      nurses: (dept.nurses || []).map((nurse) => ({
        id: nurse.id,
        name: nurse.name,
      })),
      machines: (dept.machines || []).map((machine) => ({
        id: machine.id,
        name: machine.name,
        location: machine.location,
      })),
      operations: (dept.operations || []).map((op) => ({
        id: op.id,
        name: op.name,
      })),
      numberOfBeds: dept.numberOfBeds || 0,
    }));

    // ── Aggregate statistics ───────────────────────────────────────────────
    const stats = this.calculateHospitalStats(transformedDepartments);

    return {
      type: EntityType.HOSPITAL,
      id: hospital._id,
      name: hospital.name,
      bio: hospital.bio || null,
      image: hospital.image || null,
      gallery: hospital.gallery ?? [],
      address: hospital.address,
      phones: hospital.phones,
      city: hospital.cityId,
      category: hospital.category,
      hospitalStatus: hospital.hospitalstatus,
      hospitalSpecialization: hospital.hospitalSpecialization,
      rating: hospital.rating || 0,
      profileViews: hospital.profileViews || 0,
      isSubscribed: hospital.isSubscribed,
      insuranceCompanies: hospital.insuranceCompanies || [],
      latitude: hospital.latitude || null,
      longitude: hospital.longitude || null,
      // ── DEPARTMENTS DATA ──────────────────────────────────────────────
      departments: transformedDepartments,
      departmentCount: transformedDepartments.length,
      // ── AGGREGATED STATS ──────────────────────────────────────────────
      totalDoctors: stats.totalDoctors,
      totalNurses: stats.totalNurses,
      totalBeds: stats.totalBeds,
      totalMachines: stats.totalMachines,
      totalOperations: stats.totalOperations,
      machinesList: stats.machinesList,
      operationsList: stats.operationsList,
      doctorsList: stats.doctorsList,
      // ── POSTS ────────────────────────────────────────────────────────
      posts: posts.map((p) => ({
        id: p._id,
        content: p.content,
        images: p.images || [],
        status: p.status,
        createdAt: p.createdAt,
      })),
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CENTER PROFILE (WITH DEPARTMENTS, MACHINES, OPERATIONS)
  // ══════════════════════════════════════════════════════════════════════════

  private async getCenterProfile(id: string, page: number, limit: number) {
    const center = await this.repo.findCenterById(id);
    if (!center) throw new NotFoundException('center.NOT_FOUND');

    await this.repo.incrementCenterViews(id);

    // ── Get all posts ──────────────────────────────────────────────────────
    const posts = await this.postModel
      .find({
        authorId: center._id,
        authorType: 'center',
        status: { $in: [PostStatus.APPROVED, PostStatus.PUBLISHED] },
      })
      .sort({ createdAt: -1 })
      .lean();

    // ── Get all departments ────────────────────────────────────────────────
    const departments = await this.departmentModel
      .find({ centerId: new Types.ObjectId(id) })
      .lean();

    // ── Transform departments data ─────────────────────────────────────────
    const transformedDepartments = departments.map((dept) => ({
      id: dept._id?.toString(),
      type: dept.type,
      doctors: (dept.doctors || []).map((doc) => ({
        id: doc.id,
        name: doc.name,
        specialization: doc.specialization?.toString(),
      })),
      nurses: (dept.nurses || []).map((nurse) => ({
        id: nurse.id,
        name: nurse.name,
      })),
      machines: (dept.machines || []).map((machine) => ({
        id: machine.id,
        name: machine.name,
        location: machine.location,
      })),
      operations: (dept.operations || []).map((op) => ({
        id: op.id,
        name: op.name,
      })),
      numberOfBeds: dept.numberOfBeds || 0,
    }));

    // ── Aggregate statistics ───────────────────────────────────────────────
    const stats = this.calculateCenterStats(transformedDepartments);

    return {
      type: EntityType.CENTER,
      id: center._id,
      name: center.name,
      bio: center.bio || null,
      image: center.image || null,
      address: center.address || null,
      gallery: center.gallery ?? [],
      phones: center.phones,
      city: center.cityId,
      centerSpecialization: center.centerSpecialization,
      rating: center.rating || 0,
      workingHours: center.workingHours || [],
      profileViews: center.profileViews || 0,
      isSubscribed: center.isSubscribed,
      latitude: center.latitude || null,
      longitude: center.longitude || null,
      // ── DEPARTMENTS DATA ──────────────────────────────────────────────
      departments: transformedDepartments,
      departmentCount: transformedDepartments.length,
      // ── AGGREGATED STATS ──────────────────────────────────────────────
      totalDoctors: stats.totalDoctors,
      totalNurses: stats.totalNurses,
      totalBeds: stats.totalBeds,
      totalMachines: stats.totalMachines,
      totalOperations: stats.totalOperations,
      machinesList: stats.machinesList,
      operationsList: stats.operationsList,
      doctorsList: stats.doctorsList,
      // ── POSTS ────────────────────────────────────────────────────────
      posts: posts.map((p) => ({
        id: p._id,
        content: p.content,
        images: p.images || [],
        status: p.status,
        createdAt: p.createdAt,
      })),
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // HELPER METHODS
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Calculates aggregate statistics for a hospital
   * Deduplicates doctors, machines, and operations across all departments
   */
  private calculateHospitalStats(departments: any[]): any {
    const doctorsMap = new Map();
    const machinesMap = new Map();
    const operationsMap = new Map();
    let totalNurses = 0;
    let totalBeds = 0;

    departments.forEach((dept) => {
      // ── Aggregate doctors (deduplicate) ──────────────────────────────────
      dept.doctors?.forEach((doctor) => {
        if (!doctorsMap.has(doctor.id)) {
          doctorsMap.set(doctor.id, doctor);
        }
      });

      // ── Aggregate machines (deduplicate) ─────────────────────────────────
      dept.machines?.forEach((machine) => {
        if (!machinesMap.has(machine.id)) {
          machinesMap.set(machine.id, machine);
        }
      });

      // ── Aggregate operations (deduplicate) ───────────────────────────────
      dept.operations?.forEach((operation) => {
        if (!operationsMap.has(operation.id)) {
          operationsMap.set(operation.id, operation);
        }
      });

      // ── Count nurses and beds ──────────────────────────────────────────
      totalNurses += dept.nurses?.length || 0;
      totalBeds += dept.numberOfBeds || 0;
    });

    return {
      totalDoctors: doctorsMap.size,
      totalNurses,
      totalBeds,
      totalMachines: machinesMap.size,
      totalOperations: operationsMap.size,
      doctorsList: Array.from(doctorsMap.values()),
      machinesList: Array.from(machinesMap.values()),
      operationsList: Array.from(operationsMap.values()),
    };
  }

  /**
   * Calculates aggregate statistics for a center
   * Deduplicates doctors, machines, and operations across all departments
   */
  private calculateCenterStats(departments: any[]): any {
    const doctorsMap = new Map();
    const machinesMap = new Map();
    const operationsMap = new Map();
    let totalNurses = 0;
    let totalBeds = 0;

    departments.forEach((dept) => {
      // ── Aggregate doctors (deduplicate) ──────────────────────────────────
      dept.doctors?.forEach((doctor) => {
        if (!doctorsMap.has(doctor.id)) {
          doctorsMap.set(doctor.id, doctor);
        }
      });

      // ── Aggregate machines (deduplicate) ─────────────────────────────────
      dept.machines?.forEach((machine) => {
        if (!machinesMap.has(machine.id)) {
          machinesMap.set(machine.id, machine);
        }
      });

      // ── Aggregate operations (deduplicate) ───────────────────────────────
      dept.operations?.forEach((operation) => {
        if (!operationsMap.has(operation.id)) {
          operationsMap.set(operation.id, operation);
        }
      });

      // ── Count nurses and beds ──────────────────────────────────────────
      totalNurses += dept.nurses?.length || 0;
      totalBeds += dept.numberOfBeds || 0;
    });

    return {
      totalDoctors: doctorsMap.size,
      totalNurses,
      totalBeds,
      totalMachines: machinesMap.size,
      totalOperations: operationsMap.size,
      doctorsList: Array.from(doctorsMap.values()),
      machinesList: Array.from(machinesMap.values()),
      operationsList: Array.from(operationsMap.values()),
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // GALLERY METHODS
  // ══════════════════════════════════════════════════════════════════════════

  async getGallery(id: string, type: EntityType): Promise<string[]> {
    switch (type) {
      case EntityType.HOSPITAL:
        return this.repo.getHospitalGallery(id);
      case EntityType.CENTER:
        return this.repo.getCenterGallery(id);
    }
  }

  async addGallery(
    id: string,
    type: EntityType,
    images: string[],
  ): Promise<string[]> {
    switch (type) {
      case EntityType.HOSPITAL:
        return this.repo.addHospitalGallery(id, images);
      case EntityType.CENTER:
        return this.repo.addCenterGallery(id, images);
    }
  }
}
