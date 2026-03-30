// center-condition.builder.ts
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { SearchFilterDto } from '../dto/search-filter.dto';
import { BaseConditionBuilder, MongoCondition } from './base-condition.builder';
import { Cities } from '@app/common/database/schemas/cities.schema';
import { SubCities } from '@app/common/database/schemas/sub-cities.schema';
import { CommonDepartment } from '@app/common/database/schemas/common_departments.schema';

@Injectable()
export class CenterConditionBuilder {
  constructor(
    private readonly base: BaseConditionBuilder,
    @InjectModel(Cities.name) private readonly cityModel: Model<Cities>,
    @InjectModel(SubCities.name)
    private readonly subcityModel: Model<SubCities>,
    @InjectModel(CommonDepartment.name)
    private readonly departmentModel: Model<CommonDepartment>,
  ) {}

  async build(
    dto: SearchFilterDto,
    variants: string[],
  ): Promise<MongoCondition> {
    const conditions: MongoCondition[] = [];

    // ===== TEXT SEARCH =====
    const terms = variants.length
      ? variants
      : dto.centerName
        ? [dto.centerName]
        : [];
    if (terms.length) {
      const textCondition = this.base.textSearch(['name', 'bio'], terms);
      if (textCondition) conditions.push(textCondition);
    }

    // ===== CITY FILTER =====
    if (dto.centerCity) {
      let cityId: Types.ObjectId | null = Types.ObjectId.isValid(dto.centerCity)
        ? new Types.ObjectId(dto.centerCity)
        : null;

      if (!cityId) {
        const cityDoc = await this.cityModel
          .findOne({ name: dto.centerCity })
          .lean();
        if (cityDoc) cityId = cityDoc._id;
      }

      if (cityId) {
        const cityCondition = this.base.exact('cityId', cityId);
        if (cityCondition) conditions.push(cityCondition);
      }
    }

    // ===== SUBCITY FILTER =====
    if (dto.subcity) {
      const subcityDoc = await this.subcityModel
        .findOne({ name: dto.subcity })
        .lean();
      if (subcityDoc) {
        const subcityCondition = this.base.exact('subcity', subcityDoc._id);
        if (subcityCondition) conditions.push(subcityCondition);
      }
    }

    // ===== SPECIALIZATION FILTER =====
    if (dto.centerSpecialization) {
      const specCondition = this.base.exact(
        'centerSpecialization',
        dto.centerSpecialization,
      );
      if (specCondition) conditions.push(specCondition);
    }

    // ===== ADDRESS SEARCH =====
    if (dto.address) {
      const addressCondition = this.base.textSearch(['address'], [dto.address]);
      if (addressCondition) conditions.push(addressCondition);
    }

    if (
      dto.latitude !== undefined &&
      dto.longitude !== undefined &&
      dto.radiusKm !== undefined
    ) {
      const latDelta = dto.radiusKm / 111;
      const lngDelta =
        dto.radiusKm / (111 * Math.cos((dto.latitude * Math.PI) / 180));

      conditions.push({
        latitude: {
          $gte: dto.latitude - latDelta,
          $lte: dto.latitude + latDelta,
        },
      } as MongoCondition);

      conditions.push({
        longitude: {
          $gte: dto.longitude - lngDelta,
          $lte: dto.longitude + lngDelta,
        },
      } as MongoCondition);
    }
    // ===== APPROVAL STATUS FILTER =====
    if (dto.approvalStatus) {
      const statusCondition = this.base.exact(
        'approvalStatus',
        dto.approvalStatus,
      );
      if (statusCondition) conditions.push(statusCondition);
    }

    // ===== RANGE FILTERS =====
    if (dto.minRating !== undefined) {
      const ratingCondition = this.base.range('rating', dto.minRating, 5);
      if (ratingCondition) conditions.push(ratingCondition);
    }

    // ===== MEDICAL CAPABILITIES (DEPARTMENTS/OPERATIONS/MACHINES) =====
    const centerIds: Types.ObjectId[] = [];
    if (
      dto.departments?.length ||
      dto.operations?.length ||
      dto.machines?.length
    ) {
      const depQuery: any = {};
      if (dto.departments?.length) depQuery.type = { $in: dto.departments };
      if (dto.operations?.length)
        depQuery['operations.name'] = { $in: dto.operations };
      if (dto.machines?.length)
        depQuery['machines.name'] = { $in: dto.machines };

      const deps = await this.departmentModel
        .find(depQuery, { hospitalId: 1 })
        .lean();
      deps.forEach((d) => centerIds.push(d.hospitalId));
    }

    if (centerIds.length) {
      const inCondition = this.base.in('_id', centerIds);
      if (inCondition) conditions.push(inCondition);
    }

    // ===== COMBINE ALL CONDITIONS =====
    return this.base.combine(conditions);
  }
}
