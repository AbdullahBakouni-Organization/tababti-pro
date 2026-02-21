import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SearchFilterDto } from '../dto/search-filter.dto';
import { CenterConditionBuilder } from '../builders/center-condition.builder';
import { SearchVariantsCache } from '../cache/search-variants.cache';

@Injectable()
export class CenterSearchQuery {
  constructor(
    @InjectModel('Center') private readonly model: Model<any>,
    private readonly builder: CenterConditionBuilder,
    private readonly cache: SearchVariantsCache,
  ) {}

  async execute(dto: SearchFilterDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 10;
    const skip = (page - 1) * limit;

    const variants = dto.search
      ? (this.cache.get(dto.search) ?? [dto.search])
      : [];

    const query = this.builder.build(dto, variants);

    const [data, total] = await Promise.all([
      this.model.find(query).limit(limit).skip(skip).lean(),
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
