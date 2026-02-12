import { Injectable } from '@nestjs/common';
import { ConditionEnum } from '@app/common/database/schemas/common.enums';
import { SearchStrategy } from './strategies/search-strategy.interface';
import { DoctorSearchStrategy } from './strategies/doctor-search.strategy';
import { HospitalSearchStrategy } from './strategies/hospital-search.strategy';
import { CenterSearchStrategy } from './strategies/center-search.strategy';
import { InsuranceSearchStrategy } from './strategies/insurance.strategy';
import { AllSearchStrategy } from './strategies/all.strategy';

@Injectable()
export class SearchFactory {
  constructor(
    private readonly doctor: DoctorSearchStrategy,
    private readonly hospital: HospitalSearchStrategy,
    private readonly center: CenterSearchStrategy,
    private readonly insurance: InsuranceSearchStrategy,
    private readonly all: AllSearchStrategy,
  ) {}

  getStrategy<T = any>(condition: ConditionEnum): SearchStrategy<T> {
    switch (condition) {
      case ConditionEnum.DOCTORS:
        return this.doctor as SearchStrategy<T>;
      case ConditionEnum.HOSPITAL:
        return this.hospital as SearchStrategy<T>;
      case ConditionEnum.CENTER:
        return this.center as SearchStrategy<T>;
      case ConditionEnum.INSURANCE_COMPANIES:
        return this.insurance as SearchStrategy<T>;
      case ConditionEnum.ALL:
        return this.all as SearchStrategy<T>;
    }
  }
}
//git checkout -b search-and-filter-service