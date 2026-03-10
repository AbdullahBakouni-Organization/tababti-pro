import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { PrivateSpecialization } from '@app/common/database/schemas/privatespecializations.schema';
import {
  PublicSpecialization,
  PublicSpecializationDocument,
} from '@app/common/database/schemas/publicspecializations.schema';
import { WorkigEntity } from '@app/common/database/schemas/common.enums';

@Injectable()
export class SpecializationsService {
  constructor(
    @InjectModel(PrivateSpecialization.name)
    private readonly specializationModel: Model<PrivateSpecialization>,
    @InjectModel(PublicSpecialization.name)
    private readonly publicSpecializationModel: Model<PublicSpecializationDocument>,
  ) {}

  // ── existing methods unchanged ────────────────────────────────────────────

  private toObjectIds(ids: string[]): Types.ObjectId[] {
    return ids.map((id) => {
      if (!Types.ObjectId.isValid(id))
        throw new BadRequestException('specialization.INVALID_ID');
      return new Types.ObjectId(id);
    });
  }

  async validateAndGetIds(ids: string[]): Promise<Types.ObjectId[]> {
    if (!ids || !Array.isArray(ids) || !ids.length)
      throw new BadRequestException('specialization.INVALID_ID');

    const objectIds = this.toObjectIds(ids);
    const specializations = await this.specializationModel
      .find({ _id: { $in: objectIds } })
      .select('_id')
      .lean();

    if (specializations.length !== objectIds.length)
      throw new NotFoundException('specialization.NOT_FOUND');

    return specializations.map((s) => s._id);
  }

  async getDropdownList() {
    const data = await this.specializationModel
      .find()
      .select('_id name')
      .sort({ name: 1 })
      .lean();

    if (!data.length) throw new NotFoundException('specialization.NOT_FOUND');
    return data;
  }

  // ── NEW: paginated specializations ────────────────────────────────────────

  async getPaginatedList(page = 1, limit = 10) {
    const safePage = Math.max(page, 1);
    const safeLimit = Math.min(Math.max(limit, 1), 50);
    const skip = (safePage - 1) * safeLimit;

    const [data, total] = await Promise.all([
      this.specializationModel
        .find()
        .select('_id name')
        .sort({ name: 1 })
        .skip(skip)
        .limit(safeLimit)
        .lean(),
      this.specializationModel.countDocuments(),
    ]);

    if (!data.length) throw new NotFoundException('specialization.NOT_FOUND');

    return {
      data,
      total,
      page: safePage,
      limit: safeLimit,
      totalPages: Math.ceil(total / safeLimit),
    };
  }

  // ── NEW: entities list from enum ──────────────────────────────────────────

  getEntities() {
    return Object.values(WorkigEntity).map((value) => ({
      value,
      label: this.getEntityLabel(value),
    }));
  }

  private getEntityLabel(entity: WorkigEntity): string {
    const labels: Record<WorkigEntity, string> = {
      [WorkigEntity.CLINIC]: 'Clinic',
      [WorkigEntity.HOSPITAL]: 'Hospital',
      [WorkigEntity.CENTER]: 'Center',
      [WorkigEntity.PHARMACY]: 'Pharmacy',
      [WorkigEntity.OTHER]: 'Other',
    };
    return labels[entity];
  }

  async getPrivateIdsByPublic(
    publicSpecializationId: string,
  ): Promise<Types.ObjectId[]> {
    const privateSpecs = await this.specializationModel
      .find({
        publicSpecializationId: new Types.ObjectId(publicSpecializationId),
      })
      .select('_id')
      .lean();
    return privateSpecs.map((p) => p._id);
  }

  async getPrivateIdsByPublicName(publicName: string) {
    const publicSpec = await this.publicSpecializationModel.findOne({
      name: publicName,
    });
    if (!publicSpec) throw new NotFoundException('specialization.NOT_FOUND');

    const privateSpecs = await this.specializationModel
      .find({ publicSpecializationId: publicSpec._id })
      .select('_id')
      .lean();
    return privateSpecs.map((s) => s._id);
  }

  async buildQuestionSpecializationMatch(
    doctorPrivateSpecialization: string,
  ): Promise<any> {
    if (!doctorPrivateSpecialization) return null;

    const privateSpec = await this.specializationModel
      .findOne({ name: doctorPrivateSpecialization })
      .select('_id')
      .lean();

    if (!privateSpec) return null;
    return { specializationId: { $in: [privateSpec._id] } };
  }
}
