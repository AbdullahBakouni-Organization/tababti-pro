import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SearchStrategy } from './search-strategy.interface';
import { buildSmartRegex } from '@app/common/utils/formatname.util';
import { SearchFilterDto } from '../dto/search-filter.dto';

@Injectable()
export class HospitalSearchStrategy implements SearchStrategy<{
  data: any[];
  pagination: any;
}> {
  constructor(
    @InjectModel('Hospital') private readonly hospitalModel: Model<any>,

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

    if (query.hospitalCity) conditions.push({ city: query.hospitalCity });
    if (query.hospitalCategory)
      conditions.push({ category: query.hospitalCategory });
    if (query.hospitalStatus) conditions.push({ status: query.hospitalStatus });

    if (
      query.hospitalMinBeds !== undefined ||
      query.hospitalMaxBeds !== undefined
    ) {
      const beds: any = {};
      if (query.hospitalMinBeds !== undefined)
        beds.$gte = query.hospitalMinBeds;
      if (query.hospitalMaxBeds !== undefined)
        beds.$lte = query.hospitalMaxBeds;
      conditions.push({ NumberOfBeds: beds });
    }

    if (query.hospitalNames?.length)
      conditions.push({ name: { $in: query.hospitalNames } });

    const finalQuery = conditions.length ? { $and: conditions } : {};

    const [data, total] = await Promise.all([
      this.hospitalModel
        .find(finalQuery)
        .select(
          'name address category status city NumberOfBeds phones workingHours rating',
        )
        .limit(limit)
        .skip(skip)
        .sort(sortBy ? { [sortBy]: order === 'asc' ? 1 : -1 } : { rating: -1 })
        .lean(),
      this.hospitalModel.countDocuments(finalQuery),
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
