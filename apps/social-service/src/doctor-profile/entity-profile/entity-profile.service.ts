// entity-profile.service.ts (ENHANCED)
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Post } from '@app/common/database/schemas/post.schema';
import { CommonDepartment } from '@app/common/database/schemas/common_departments.schema';
import { PostStatus } from '@app/common/database/schemas/common.enums';
import { EntityProfileRepository } from './entity-profile.repository';
import { EntityType } from '../dto/get-entity-profile.dto';

@Injectable()
export class EntityProfileService {
  constructor(
    private readonly repo: EntityProfileRepository,
    @InjectModel(Post.name) private readonly postModel: Model<Post>,
    @InjectModel(CommonDepartment.name)
    private readonly departmentModel: Model<CommonDepartment>,
  ) {}

  async getEntityProfile(id: string, type: EntityType) {
    switch (type) {
      case EntityType.DOCTOR:
        return this.getDoctorProfile(id);
      case EntityType.HOSPITAL:
        return this.getHospitalProfile(id);
      case EntityType.CENTER:
        return this.getCenterProfile(id);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // DOCTOR PROFILE
  // ══════════════════════════════════════════════════════════════════════════

  private async getDoctorProfile(id: string) {
    const doctor = await this.repo.findDoctorById(id);
    if (!doctor) throw new NotFoundException('doctor.NOT_FOUND');

    await this.repo.incrementDoctorViews(id);

    const posts = await this.postModel
      .find({
        authorId: doctor._id,
        authorType: 'doctor',
        status: { $in: [PostStatus.APPROVED, PostStatus.PUBLISHED] },
      })
      .sort({ createdAt: -1 })
      .lean();

    return {
      type: EntityType.DOCTOR,
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
      yearsOfExperience: this.calculateYears(doctor.yearsOfExperience),
      experienceStartDate: doctor.yearsOfExperience || null,
      rating: doctor.rating || 0,
      gallery: doctor.gallery ?? [],
      workingHours: doctor.workingHours || [],
      profileViews: doctor.profileViews || 0,
      isSubscribed: doctor.isSubscribed,
      insuranceCompanies: doctor.insuranceCompanies || [],
      hospitals: doctor.hospitals || [],
      centers: doctor.centers || [],
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
  // HOSPITAL PROFILE (WITH DEPARTMENTS, MACHINES, OPERATIONS)
  // ══════════════════════════════════════════════════════════════════════════

  private async getHospitalProfile(id: string) {
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

  private async getCenterProfile(id: string) {
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

  private calculateYears(startDate: Date): number {
    if (!startDate) return 0;
    const today = new Date();
    const start = new Date(startDate);
    let years = today.getFullYear() - start.getFullYear();
    const monthDiff = today.getMonth() - start.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < start.getDate()))
      years--;
    return years;
  }

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
      case EntityType.DOCTOR:
        return this.repo.getDoctorGallery(id);
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
      case EntityType.DOCTOR:
        return this.repo.addDoctorGallery(id, images);
      case EntityType.HOSPITAL:
        return this.repo.addHospitalGallery(id, images);
      case EntityType.CENTER:
        return this.repo.addCenterGallery(id, images);
    }
  }

  async removeGallery(
    id: string,
    type: EntityType,
    images: string[],
  ): Promise<string[]> {
    switch (type) {
      case EntityType.DOCTOR:
        return this.repo.removeDoctorGallery(id, images);
      case EntityType.HOSPITAL:
        return this.repo.removeHospitalGallery(id, images);
      case EntityType.CENTER:
        return this.repo.removeCenterGallery(id, images);
    }
  }

  async clearGallery(id: string, type: EntityType): Promise<void> {
    switch (type) {
      case EntityType.DOCTOR:
        return this.repo.clearDoctorGallery(id);
      case EntityType.HOSPITAL:
        return this.repo.clearHospitalGallery(id);
      case EntityType.CENTER:
        return this.repo.clearCenterGallery(id);
    }
  }
}
