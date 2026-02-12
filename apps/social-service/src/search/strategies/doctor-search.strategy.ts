import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SearchStrategy } from './search-strategy.interface';
import { buildSmartRegex } from '@app/common/utils/formatname.util';
import { SearchFilterDto } from '../dto/search-filter.dto';

type DoctorQuery = SearchFilterDto & { variants?: string[] };

@Injectable()
export class DoctorSearchStrategy implements SearchStrategy<{
  data: any[];
  pagination: any;
}> {
  constructor(
    @InjectModel('Doctor') private readonly doctorModel: Model<any>,
    @InjectModel('PrivateSpecialization')
    private readonly privateSpecModel?: Model<any>,
    @InjectModel('Hospital') private readonly hospitalModel?: Model<any>,
    @InjectModel('InsuranceCompany')
    private readonly insuranceModel?: Model<any>,
  ) {}

  async search(
    query: DoctorQuery,
    skip = 0,
    limit = 10,
    sortBy?: string,
    order: 'asc' | 'desc' = 'desc',
  ) {
    const conditions: any[] = [];
    const variants = query.variants ?? [];

    if (variants.length) {
      const fields = ['firstName', 'middleName', 'lastName', 'address'];
      conditions.push({
        $or: variants.flatMap((v) =>
          fields.map((f) => ({ [f]: { $regex: v, $options: 'i' } })),
        ),
      });
    } else if (query.search) {
      const r = new RegExp(query.search, 'i');
      conditions.push({
        $or: [
          { firstName: r },
          { middleName: r },
          { lastName: r },
          { address: r },
        ],
      });
    }

    if (query.role) conditions.push({ role: query.role });
    if (query.generalSpecialty)
      conditions.push({ publicSpecializationName: query.generalSpecialty });

    if (query.privateSpecializationNames?.length) {
      const regexes = query.privateSpecializationNames.map(buildSmartRegex);
      const ids = await (this.privateSpecModel ?? this.doctorModel)
        .find({ $or: regexes.map((rx) => ({ name: rx })) })
        .distinct('_id');
      if (ids.length)
        conditions.push({ privateSpecializationIds: { $in: ids } });
    }

    if (query.yearsOfExperience !== undefined)
      conditions.push({ yearsOfExperience: query.yearsOfExperience });

    if (query.hospitalNames?.length) {
      const regexes = query.hospitalNames.map(buildSmartRegex);
      const hospitalIds = await (this.hospitalModel ?? this.doctorModel)
        .find({ $or: regexes.map((rx) => ({ name: rx })) })
        .distinct('_id');
      if (hospitalIds.length)
        conditions.push({ hospitals: { $in: hospitalIds } });
    }

    if (query.insuranceCompanies?.length) {
      const regexes = query.insuranceCompanies.map(buildSmartRegex);
      const insuranceIds = await (this.insuranceModel ?? this.doctorModel)
        .find({ $or: regexes.map((rx) => ({ name: rx })) })
        .distinct('_id');
      if (insuranceIds.length)
        conditions.push({ insuranceCompanies: { $in: insuranceIds } });
    }

    const finalQuery = conditions.length ? { $and: conditions } : {};

    const [data, total] = await Promise.all([
      this.doctorModel
        .find(finalQuery)
        .select(
          'firstName middleName lastName address yearsOfExperience hospitals insuranceCompanies rating workingHours',
        )
        .limit(limit)
        .skip(skip)
        .sort(sortBy ? { [sortBy]: order === 'asc' ? 1 : -1 } : { rating: -1 })
        .lean(),
      this.doctorModel.countDocuments(finalQuery),
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
