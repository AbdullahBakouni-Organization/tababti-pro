import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, SortOrder } from 'mongoose';
import { SearchFilterDto } from '../dto/search-filter.dto';
import { DoctorConditionBuilder } from '../builders/doctor-condition.builder';
import { SearchVariantsCache } from '../cache/search-variants.cache';
import { SearchEnhancerService } from '../enhancers/search-enhancer.service';
import { Doctor } from '@app/common/database/schemas/doctor.schema';

@Injectable()
export class DoctorSearchQuery {
  constructor(
    @InjectModel('Doctor') private readonly model: Model<Doctor>,
    private readonly builder: DoctorConditionBuilder,
    private readonly cache: SearchVariantsCache,
    private readonly enhancer: SearchEnhancerService,
  ) {}

  async execute(dto: SearchFilterDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 10;
    const skip = (page - 1) * limit;

    if (dto.search) {
      this.enhancer.trigger(dto.search);
    }

    const variants = dto.search
      ? (this.cache.get(dto.search) ?? [dto.search])
      : [];

    const query = this.builder.build(dto, variants);

    const sort: Record<string, SortOrder> | undefined = dto.sortBy
      ? { [dto.sortBy]: dto.order === 'asc' ? 1 : -1 }
      : undefined;

    const mongooseQuery = this.model
      .find(query)
      .select({
        firstName: 1,
        middleName: 1,
        lastName: 1,
        yearsOfExperience: 1,
        image: 1,
        gender: 1,
        inspectionPrice: 1,
        inspectionDuration: 1,
        cityId: 1,
        city: 1,
        subcity: 1,
        publicSpecializationId: 1,
        privateSpecializationId: 1,
        publicSpecialization: 1,
        privateSpecialization: 1,
      })
      .populate('publicSpecializationId', 'name')
      .populate('privateSpecializationId', 'name')
      .skip(skip)
      .limit(limit)
      .lean();
    if (sort) mongooseQuery.sort(sort);

    const [data, total] = await Promise.all([
      mongooseQuery,
      this.model.countDocuments(query),
    ]);

    return {
      data,
      total,
      page,
      pages: Math.ceil(total / limit),
    };
  }
}
