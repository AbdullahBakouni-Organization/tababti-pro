import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { SearchFilterDto } from '../dto/search-filter.dto';
import { BaseConditionBuilder, MongoCondition } from './base-condition.builder';
import { Cities } from '@app/common/database/schemas/cities.schema';
import { SubCities } from '@app/common/database/schemas/sub-cities.schema';
import { CommonDepartment } from '@app/common/database/schemas/common_departments.schema';

@Injectable()
export class HospitalConditionBuilder {
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
      : dto.hospitalName
        ? [dto.hospitalName]
        : [];
    if (terms.length) {
      const textCondition = this.base.textSearch(['name', 'bio'], terms);
      if (textCondition) conditions.push(textCondition as MongoCondition);
    }

    // ===== CITY FILTER =====
    if (dto.hospitalCity) {
      let cityId: Types.ObjectId | null = Types.ObjectId.isValid(
        dto.hospitalCity,
      )
        ? new Types.ObjectId(dto.hospitalCity)
        : null;

      if (!cityId) {
        const cityDoc = await this.cityModel
          .findOne({ name: dto.hospitalCity })
          .lean();
        if (cityDoc) cityId = cityDoc._id;
      }

      if (cityId) {
        const cityCondition = this.base.exact('cityId', cityId);
        if (cityCondition) conditions.push(cityCondition as MongoCondition);
      }
    }

    // ===== SUBCITY FILTER =====
    if (dto.subcity) {
      const subcityDoc = await this.subcityModel
        .findOne({ name: dto.subcity })
        .lean();
      if (subcityDoc) {
        const subcityCondition = this.base.exact('subcity', subcityDoc._id);
        if (subcityCondition)
          conditions.push(subcityCondition as MongoCondition);
      }
    }

    // ===== BASIC HOSPITAL FILTERS =====
    [
      { field: 'category', value: dto.hospitalCategory },
      { field: 'hospitalstatus', value: dto.hospitalStatus },
      { field: 'hospitalSpecialization', value: dto.hospitalCategory },
      { field: 'status', value: dto.approvalStatus },
    ].forEach(({ field, value }) => {
      const cond = value ? this.base.exact(field, value) : null;
      if (cond) conditions.push(cond as MongoCondition);
    });

    // ===== RANGE FILTERS =====
    if (
      dto.hospitalMinBeds !== undefined ||
      dto.hospitalMaxBeds !== undefined
    ) {
      const bedsCondition = this.base.range(
        'beds',
        dto.hospitalMinBeds,
        dto.hospitalMaxBeds,
      );
      if (bedsCondition) conditions.push(bedsCondition as MongoCondition);
    }

    if (dto.minRating !== undefined) {
      const ratingCondition = this.base.range('rating', dto.minRating, 5);
      if (ratingCondition) conditions.push(ratingCondition as MongoCondition);
    }

    // ===== MEDICAL CAPABILITIES (CommonDepartment) =====
    const depIds: Types.ObjectId[] = [];
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
      deps.forEach((d) => depIds.push(d.hospitalId));
    }

    if (depIds.length) {
      const inCondition = this.base.in('_id', depIds);
      if (inCondition) conditions.push(inCondition as MongoCondition);
    }

    // ===== COMBINE ALL CONDITIONS =====
    return this.base.combine(conditions);
  }
}
