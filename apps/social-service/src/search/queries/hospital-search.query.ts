import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, SortOrder } from 'mongoose';
import { SearchFilterDto } from '../dto/search-filter.dto';
import { HospitalConditionBuilder } from '../builders/hospital-condition.builder';
import { SearchVariantsCache } from '../cache/search-variants.cache';

@Injectable()
export class HospitalSearchQuery {
  constructor(
    @InjectModel('Hospital') private readonly model: Model<any>,
    private readonly builder: HospitalConditionBuilder,
    private readonly cache: SearchVariantsCache,
  ) {}

  async execute(dto: SearchFilterDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 10;
    const skip = (page - 1) * limit;

    // ===== SEARCH VARIANTS =====
    const variants = dto.search
      ? (this.cache.get(dto.search) ?? [dto.search])
      : [];

    // ===== BUILD QUERY =====
    const query = await this.builder.build(dto, variants); // <- حل الـ Promise هنا

    // ===== SORTING =====
    const sort: Record<string, SortOrder> | undefined = dto.sortBy
      ? { [dto.sortBy]: dto.order === 'asc' ? 1 : -1 }
      : undefined;

    const mongooseQuery = this.model.find(query).skip(skip).limit(limit).lean();
    if (sort) mongooseQuery.sort(sort);

    // ===== EXECUTE QUERY =====
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
