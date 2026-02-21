import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, SortOrder } from 'mongoose';
import { SearchFilterDto } from '../dto/search-filter.dto';
import { DoctorConditionBuilder } from '../builders/doctor-condition.builder';
import { SearchVariantsCache } from '../cache/search-variants.cache';
import { Doctor } from '@app/common/database/schemas/doctor.schema';
import { SearchResult } from '../interfaces/search-result.interface';

@Injectable()
export class DoctorSearchQuery {
  constructor(
    @InjectModel('Doctor') private readonly model: Model<Doctor>,
    private readonly builder: DoctorConditionBuilder,
    private readonly cache: SearchVariantsCache,
  ) {}

  async execute(dto: SearchFilterDto): Promise<SearchResult<Doctor>> {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 10;
    const skip = (page - 1) * limit;

    const variants = dto.search
      ? (this.cache.get(dto.search) ?? [dto.search])
      : [];

    const query = this.builder.build(dto, variants);

    const sort: Record<string, SortOrder> | undefined = dto.sortBy
      ? { [dto.sortBy]: dto.order === 'asc' ? 1 : -1 }
      : undefined;

    const mongooseQuery = this.model.find(query).lean();
    if (sort) mongooseQuery.sort(sort);

    const [data, total] = await Promise.all([
      mongooseQuery.skip(skip).limit(limit),
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
