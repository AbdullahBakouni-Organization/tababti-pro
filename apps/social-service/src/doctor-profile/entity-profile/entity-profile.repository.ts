import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Doctor } from '@app/common/database/schemas/doctor.schema';
import { Hospital } from '@app/common/database/schemas/hospital.schema';
import { Center } from '@app/common/database/schemas/center.schema';
import { CommonDepartment } from '@app/common/database/schemas/common_departments.schema';
import { UserRole } from '@app/common/database/schemas/common.enums';
import { EntityType } from '../dto/get-entity-profile.dto';

// Doctor → status, Hospital → status, Center → approvalStatus
const STATUS_FIELD: Record<EntityType, string> = {
  [EntityType.DOCTOR]: 'status',
  [EntityType.HOSPITAL]: 'status',
  [EntityType.CENTER]: 'approvalStatus',
};

@Injectable()
export class EntityProfileRepository {
  constructor(
    @InjectModel(Doctor.name) private readonly doctorModel: Model<Doctor>,
    @InjectModel(Hospital.name) private readonly hospitalModel: Model<Hospital>,
    @InjectModel(Center.name) private readonly centerModel: Model<Center>,
    @InjectModel(CommonDepartment.name)
    private readonly departmentModel: Model<CommonDepartment>,
  ) {}

  // ── Helpers ───────────────────────────────────────────────────────────────

  private assertValidId(id: string) {
    if (!Types.ObjectId.isValid(id))
      throw new BadRequestException('common.INVALID_ID');
  }

  private modelFor(type: EntityType): Model<any> {
    switch (type) {
      case EntityType.DOCTOR:
        return this.doctorModel;
      case EntityType.HOSPITAL:
        return this.hospitalModel;
      case EntityType.CENTER:
        return this.centerModel;
    }
  }

  private modelByRole(role: UserRole): Model<any> {
    switch (role) {
      case UserRole.DOCTOR:
        return this.doctorModel;
      case UserRole.HOSPITAL:
        return this.hospitalModel;
      case UserRole.CENTER:
        return this.centerModel;
      default:
        throw new BadRequestException('entity.INVALID_ROLE');
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // FIND — single entity (approved only, public)
  // ══════════════════════════════════════════════════════════════════════════

  async findDoctorById(id: string) {
    this.assertValidId(id);
    return this.doctorModel
      .findOne({ _id: new Types.ObjectId(id), status: 'approved' })
      .select('-password -twoFactorSecret -sessions -workingHoursVersion')
      .lean();
  }

  async findHospitalById(id: string) {
    this.assertValidId(id);
    return this.hospitalModel
      .findOne({ _id: new Types.ObjectId(id), status: 'approved' })
      .select('-deviceTokens')
      .lean();
  }

  async findCenterById(id: string) {
    this.assertValidId(id);
    return this.centerModel
      .findOne({ _id: new Types.ObjectId(id), approvalStatus: 'approved' })
      .select('-deviceTokens')
      .lean();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // FIND — by authAccountId (owner check)
  // ══════════════════════════════════════════════════════════════════════════

  async findByAuthAccountId(authAccountId: string, role: UserRole) {
    this.assertValidId(authAccountId);
    return this.modelByRole(role)
      .findOne({ authAccountId: new Types.ObjectId(authAccountId) })
      .lean();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // BROWSE / LIST (paginated)
  // ══════════════════════════════════════════════════════════════════════════

  async findApprovedEntities(type: EntityType, page: number, limit: number) {
    const skip = (page - 1) * limit;
    const model = this.modelFor(type);
    const query = { [STATUS_FIELD[type]]: 'approved' };

    const [data, total] = await Promise.all([
      model.find(query).skip(skip).limit(limit).lean(),
      model.countDocuments(query),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findAllEntities(
    type: EntityType,
    status?: string,
    page = 1,
    limit = 10,
  ) {
    const skip = (page - 1) * limit;
    const model = this.modelFor(type);
    const query: Record<string, any> = status
      ? { [STATUS_FIELD[type]]: status }
      : {};

    const [data, total] = await Promise.all([
      model.find(query).skip(skip).limit(limit).lean(),
      model.countDocuments(query),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // APPROVE / REJECT entity profile
  // ══════════════════════════════════════════════════════════════════════════

  async updateEntityStatus(
    id: string,
    type: EntityType,
    status: string,
    rejectionReason?: string,
  ) {
    this.assertValidId(id);
    const update: Record<string, any> = { [STATUS_FIELD[type]]: status };
    if (rejectionReason) update.rejectionReason = rejectionReason;

    const updated = await this.modelFor(type)
      .findByIdAndUpdate(
        new Types.ObjectId(id),
        { $set: update },
        { new: true },
      )
      .lean();

    if (!updated) throw new NotFoundException('entity.NOT_FOUND');
    return updated;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PROFILE VIEWS
  // ══════════════════════════════════════════════════════════════════════════

  async incrementViews(id: string, type: EntityType) {
    this.assertValidId(id);
    await this.modelFor(type).updateOne(
      { _id: new Types.ObjectId(id) },
      { $inc: { profileViews: 1 } },
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // GALLERY — GET
  // ══════════════════════════════════════════════════════════════════════════

  async getGallery(id: string, type: EntityType): Promise<string[]> {
    this.assertValidId(id);
    const doc = await this.modelFor(type).findById(id).select('gallery').lean();
    return (doc as any)?.gallery ?? [];
  }

  // ══════════════════════════════════════════════════════════════════════════
  // GALLERY — ADD (owner upload or user URL submission → directly into gallery)
  // ══════════════════════════════════════════════════════════════════════════

  async addGallery(
    id: string,
    type: EntityType,
    images: string[],
  ): Promise<string[]> {
    this.assertValidId(id);
    const doc = await this.modelFor(type)
      .findByIdAndUpdate(
        id,
        { $addToSet: { gallery: { $each: images } } },
        { new: true },
      )
      .select('gallery')
      .lean();

    if (!doc) throw new NotFoundException('entity.NOT_FOUND');
    return (doc as any).gallery ?? [];
  }

  // ══════════════════════════════════════════════════════════════════════════
  // GALLERY — REMOVE specific images
  // ══════════════════════════════════════════════════════════════════════════

  async removeGallery(
    id: string,
    type: EntityType,
    images: string[],
  ): Promise<string[]> {
    this.assertValidId(id);
    const doc = await this.modelFor(type)
      .findByIdAndUpdate(id, { $pullAll: { gallery: images } }, { new: true })
      .select('gallery')
      .lean();

    if (!doc) throw new NotFoundException('entity.NOT_FOUND');
    return (doc as any).gallery ?? [];
  }

  // ══════════════════════════════════════════════════════════════════════════
  // GALLERY — CLEAR all
  // ══════════════════════════════════════════════════════════════════════════

  async clearGallery(id: string, type: EntityType): Promise<void> {
    this.assertValidId(id);
    await this.modelFor(type).updateOne(
      { _id: new Types.ObjectId(id) },
      { $set: { gallery: [] } },
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // DEPARTMENTS
  // ══════════════════════════════════════════════════════════════════════════

  async findHospitalDepartments(hospitalId: string) {
    this.assertValidId(hospitalId);
    return this.departmentModel
      .find({ hospitalId: new Types.ObjectId(hospitalId) })
      .lean();
  }

  async findCenterDepartments(centerId: string) {
    this.assertValidId(centerId);
    return this.departmentModel
      .find({ centerId: new Types.ObjectId(centerId) })
      .lean();
  }
}
