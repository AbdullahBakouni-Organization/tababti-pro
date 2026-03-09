import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Post } from '@app/common/database/schemas/post.schema';
import { CommonDepartment } from '@app/common/database/schemas/common_departments.schema';
import {
  PostStatus,
  UserRole,
} from '@app/common/database/schemas/common.enums';
import { EntityProfileRepository } from './entity-profile.repository';
import { EntityType, ReviewEntityDto } from '../dto/get-entity-profile.dto';

@Injectable()
export class EntityProfileService {
  constructor(
    private readonly repo: EntityProfileRepository,
    @InjectModel(Post.name) private readonly postModel: Model<Post>,
    @InjectModel(CommonDepartment.name)
    private readonly departmentModel: Model<CommonDepartment>,
  ) {}

  async getEntityProfile(id: string, type: UserRole) {
    switch (type) {
      case UserRole.DOCTOR:
        return this.getDoctorProfile(id);
      case UserRole.HOSPITAL:
        return this.getHospitalProfile(id);
      case UserRole.CENTER:
        return this.getCenterProfile(id);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // OWNER — own profile
  // ══════════════════════════════════════════════════════════════════════════

  async getMyProfile(authAccountId: string, role: UserRole) {
    const entity = await this.repo.findByAuthAccountId(authAccountId, role);
    if (!entity) throw new NotFoundException('entity.NOT_FOUND');
    return this.getEntityProfile(
      (entity as any)._id.toString(),
      this.roleToEntityType(role),
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // BROWSE / LIST
  // ══════════════════════════════════════════════════════════════════════════

  async browseEntities(type: EntityType, page: number, limit: number) {
    return this.repo.findApprovedEntities(type, page, limit);
  }

  async adminListEntities(
    type: EntityType,
    status?: string,
    page = 1,
    limit = 10,
  ) {
    return this.repo.findAllEntities(type, status, page, limit);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ADMIN — review entity profile
  // ══════════════════════════════════════════════════════════════════════════

  async reviewEntity(id: string, type: EntityType, dto: ReviewEntityDto) {
    const status = dto.action === 'approve' ? 'approved' : 'rejected';
    return this.repo.updateEntityStatus(id, type, status, dto.rejectionReason);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // OWNERSHIP CHECK
  // ══════════════════════════════════════════════════════════════════════════

  async assertEntityOwner(
    entityId: string,
    type: EntityType,
    authAccountId: string,
  ): Promise<void> {
    const role = this.entityTypeToRole(type);
    const entity = await this.repo.findByAuthAccountId(authAccountId, role);
    if (!entity || (entity as any)._id.toString() !== entityId) {
      throw new ForbiddenException('entity.FORBIDDEN');
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // GALLERY
  // ══════════════════════════════════════════════════════════════════════════

  async getGallery(id: string, type: EntityType): Promise<string[]> {
    return this.repo.getGallery(id, type);
  }

  async addGallery(
    id: string,
    type: EntityType,
    images: string[],
  ): Promise<string[]> {
    return this.repo.addGallery(id, type, images);
  }

  async removeGallery(
    id: string,
    type: EntityType,
    images: string[],
  ): Promise<string[]> {
    return this.repo.removeGallery(id, type, images);
  }

  async clearGallery(id: string, type: EntityType): Promise<void> {
    return this.repo.clearGallery(id, type);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PRIVATE — profile builders
  // ══════════════════════════════════════════════════════════════════════════

  private async getDoctorProfile(id: string) {
    const doctor = await this.repo.findDoctorById(id);
    if (!doctor) throw new NotFoundException('entity.NOT_FOUND');

    await this.repo.incrementViews(id, EntityType.DOCTOR);

    const posts = await this.postModel
      .find({
        authorId: doctor._id,
        authorType: 'doctor',
        status: { $in: [PostStatus.APPROVED, PostStatus.PUBLISHED] },
      })
      .sort({ createdAt: -1 })
      .lean();

    return {
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

  private async getHospitalProfile(id: string) {
    const hospital = await this.repo.findHospitalById(id);
    if (!hospital) throw new NotFoundException('entity.NOT_FOUND');

    await this.repo.incrementViews(id, EntityType.HOSPITAL);

    const [posts, departments] = await Promise.all([
      this.postModel
        .find({
          authorId: hospital._id,
          authorType: 'hospital',
          status: { $in: [PostStatus.APPROVED, PostStatus.PUBLISHED] },
        })
        .sort({ createdAt: -1 })
        .lean(),
      this.departmentModel.find({ hospitalId: new Types.ObjectId(id) }).lean(),
    ]);

    const transformedDepartments = this.transformDepartments(departments);

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
      departments: transformedDepartments,
      departmentCount: transformedDepartments.length,
      ...this.aggregateStats(transformedDepartments),
      posts: posts.map((p) => ({
        id: p._id,
        content: p.content,
        images: p.images || [],
        status: p.status,
        createdAt: p.createdAt,
      })),
    };
  }

  private async getCenterProfile(id: string) {
    const center = await this.repo.findCenterById(id);
    if (!center) throw new NotFoundException('entity.NOT_FOUND');

    await this.repo.incrementViews(id, EntityType.CENTER);

    const [posts, departments] = await Promise.all([
      this.postModel
        .find({
          authorId: center._id,
          authorType: 'center',
          status: { $in: [PostStatus.APPROVED, PostStatus.PUBLISHED] },
        })
        .sort({ createdAt: -1 })
        .lean(),
      this.departmentModel.find({ centerId: new Types.ObjectId(id) }).lean(),
    ]);

    const transformedDepartments = this.transformDepartments(departments);

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
      departments: transformedDepartments,
      departmentCount: transformedDepartments.length,
      ...this.aggregateStats(transformedDepartments),
      posts: posts.map((p) => ({
        id: p._id,
        content: p.content,
        images: p.images || [],
        status: p.status,
        createdAt: p.createdAt,
      })),
    };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private transformDepartments(departments: any[]) {
    return departments.map((dept) => ({
      id: dept._id?.toString(),
      type: dept.type,
      doctors: (dept.doctors || []).map((d) => ({
        id: d.id,
        name: d.name,
        specialization: d.specialization?.toString(),
      })),
      nurses: (dept.nurses || []).map((n) => ({ id: n.id, name: n.name })),
      machines: (dept.machines || []).map((m) => ({
        id: m.id,
        name: m.name,
        location: m.location,
      })),
      operations: (dept.operations || []).map((o) => ({
        id: o.id,
        name: o.name,
      })),
      numberOfBeds: dept.numberOfBeds || 0,
    }));
  }

  private aggregateStats(departments: any[]) {
    const doctorsMap = new Map();
    const machinesMap = new Map();
    const operationsMap = new Map();
    let totalNurses = 0;
    let totalBeds = 0;

    departments.forEach((dept) => {
      dept.doctors?.forEach((d) => {
        if (!doctorsMap.has(d.id)) doctorsMap.set(d.id, d);
      });
      dept.machines?.forEach((m) => {
        if (!machinesMap.has(m.id)) machinesMap.set(m.id, m);
      });
      dept.operations?.forEach((o) => {
        if (!operationsMap.has(o.id)) operationsMap.set(o.id, o);
      });
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

  async removeGallery(
    id: string,
    type: EntityType,
    images: string[],
  ): Promise<string[]> {
    switch (type) {
      case EntityType.HOSPITAL:
        return this.repo.removeHospitalGallery(id, images);
      case EntityType.CENTER:
        return this.repo.removeCenterGallery(id, images);
    }
  }

  private entityTypeToRole(type: EntityType): UserRole {
    switch (type) {
      case EntityType.HOSPITAL:
        return UserRole.HOSPITAL;
      case EntityType.CENTER:
        return UserRole.CENTER;
    }
  }
}
