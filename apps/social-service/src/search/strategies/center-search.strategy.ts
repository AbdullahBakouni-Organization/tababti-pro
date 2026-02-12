import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SearchStrategy } from './search-strategy.interface';
import { SearchFilterDto } from '../dto/search-filter.dto';

@Injectable()
export class CenterSearchStrategy implements SearchStrategy<{
  data: any[];
  pagination: any;
}> {
  constructor(
    @InjectModel('Center') private readonly centerModel: Model<any>,
  ) {}

  async search(
    query: SearchFilterDto,
    skip = 0,
    limit = 10,
    sortBy?: string,
    order: 'asc' | 'desc' = 'desc',
  ) {
    const conditions: any[] = [];
    const variants: string[] = (query as any).variants ?? [];

    if (variants.length)
      conditions.push({
        $or: variants.map((v) => ({ name: { $regex: v, $options: 'i' } })),
      });
    else if (query.search)
      conditions.push({ name: { $regex: query.search, $options: 'i' } });

    if (query.centerCity) conditions.push({ city: query.centerCity });
    if (query.centerSpecialization)
      conditions.push({ category: query.centerSpecialization });

    const finalQuery = conditions.length ? { $and: conditions } : {};

    const [data, total] = await Promise.all([
      this.centerModel
        .find(finalQuery)
        .select('name address category city phones workingHours rating')
        .limit(limit)
        .skip(skip)
        .sort(sortBy ? { [sortBy]: order === 'asc' ? 1 : -1 } : { rating: -1 })
        .lean(),
      this.centerModel.countDocuments(finalQuery),
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
