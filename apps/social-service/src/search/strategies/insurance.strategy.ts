import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SearchStrategy } from './search-strategy.interface';
import { SearchFilterDto } from '../dto/search-filter.dto';

@Injectable()
export class InsuranceSearchStrategy implements SearchStrategy {
  constructor(
    @InjectModel('InsuranceCompany')
    private readonly insuranceModel: Model<any>,
  ) {}

  async search(query: SearchFilterDto, skip = 0, limit = 10) {
    const conditions: any[] = [];
    const variants: string[] = (query as any).variants ?? [];

    if (variants.length) {
      conditions.push({
        $or: variants.map((v) => ({ name: { $regex: v, $options: 'i' } })),
      });
    } else if (query.search) {
      conditions.push({ name: { $regex: query.search, $options: 'i' } });
    }

    const finalQuery = conditions.length ? { $and: conditions } : {};
    const [data, total] = await Promise.all([
      this.insuranceModel.find(finalQuery).limit(limit).skip(skip).lean(),
      this.insuranceModel.countDocuments(finalQuery),
    ]);

    return {
      data,
      pagination: {
        page: Math.floor(skip / limit) + 1,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
