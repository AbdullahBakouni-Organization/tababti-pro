import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, SortOrder } from 'mongoose';
import { SearchFilterDto } from '../dto/search-filter.dto';
import { Center } from '@app/common/database/schemas/center.schema';
import { CenterConditionBuilder } from '../builders/center-condition.builder';
import { SearchEnhancerService } from '../enhancers/search-enhancer.service';
import { HospitalIncludeEnhancer } from '../enhancers/hospital-include.enhancer';

@Injectable()
export class CenterSearchQuery {
  constructor(
    @InjectModel(Center.name) private readonly model: Model<Center>,
    private readonly builder: CenterConditionBuilder,
    private readonly enhancer: SearchEnhancerService,
    private readonly includeEnhancer: HospitalIncludeEnhancer,
  ) {}

  async execute(dto: SearchFilterDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 10;
    const skip = (page - 1) * limit;

    if (dto.search) {
      this.enhancer.trigger(dto.search);
    }

    const variants = dto.search ? [dto.search] : [];
    const query = await this.builder.build(dto, variants);

    const sort: Record<string, SortOrder> | undefined = dto.sortBy
      ? { [dto.sortBy]: dto.order === 'asc' ? 1 : -1 }
      : undefined;

    const mongooseQuery = this.model
      .find(query)
      .select({
        name: 1,
        address: 1,
        bio: 1,
        centerSpecialization: 1,
        cityId: 1,
        city: 1,
        subcity: 1,
        image: 1,
      })
      .populate({ path: 'cityId', select: 'name' })
      .skip(skip)
      .limit(limit)
      .lean();

    if (sort) mongooseQuery.sort(sort);

    const [data, total] = await Promise.all([
      mongooseQuery,
      this.model.countDocuments(query),
    ]);

    const resultData = await this.includeEnhancer.withDepartments(data);

    const finalData = resultData.map((center) => ({
      ...center,
      city: center.cityId?.name || null,
    }));

    return {
      data: finalData,
      total,
      page,
      pages: Math.ceil(total / limit),
    };
  }
}
