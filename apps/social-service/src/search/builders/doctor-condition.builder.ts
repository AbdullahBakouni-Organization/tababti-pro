import { Injectable } from '@nestjs/common';
import { SearchFilterDto } from '../dto/search-filter.dto';
import { BaseConditionBuilder, MongoCondition } from './base-condition.builder';

@Injectable()
export class DoctorConditionBuilder {
  constructor(private readonly base: BaseConditionBuilder) {}

  build(dto: SearchFilterDto, variants: string[]): MongoCondition {
    const conditions: MongoCondition[] = [];

    if (variants.length) {
      conditions.push(
        this.base.textSearch(
          [
            'firstName',
            'lastName',
            'middleName',
            'bio',
            'publicSpecialization',
            'privateSpecialization',
          ],
          variants,
        ),
      );
    }

    [
      this.base.exact('gender', dto.gender),
      this.base.exact('city', dto.city),
      this.base.exact('subcity', dto.subcity),
      this.base.exact('availableDay', dto.availableDay),
      this.base.in('publicSpecialization', dto.generalSpecialtyNames),
      this.base.in('privateSpecialization', dto.privateSpecializationNames),
      this.base.min('yearsOfExperience', dto.minExperience),
      this.base.range(
        'inspectionPrice',
        dto.inspectionPriceMin,
        dto.inspectionPriceMax,
      ),
      this.base.min('rating', dto.minRating),
    ].forEach((c) => c && conditions.push(c));

    return this.base.combine(conditions);
  }
}
