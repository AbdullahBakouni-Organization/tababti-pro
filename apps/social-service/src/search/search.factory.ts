import { Injectable } from '@nestjs/common';
import { ConditionEnum } from '@app/common/database/schemas/common.enums';
import { SearchStrategy } from './strategies/search-strategy.interface';
import { DoctorSearchStrategy } from './strategies/doctor-search.strategy';
import { HospitalSearchStrategy } from './strategies/hospital-search.strategy';
import { CenterSearchStrategy } from './strategies/center-search.strategy';
import { AllSearchStrategy } from './strategies/all.strategy';

@Injectable()
export class SearchFactory {
  constructor(
    private readonly doctor: DoctorSearchStrategy,
    private readonly hospital: HospitalSearchStrategy,
    private readonly center: CenterSearchStrategy,
    private readonly all: AllSearchStrategy,
  ) { }

  getStrategy(condition: ConditionEnum): SearchStrategy {
    switch (condition) {
      case ConditionEnum.DOCTORS:
        return this.doctor;

      case ConditionEnum.HOSPITAL:
        return this.hospital;

      case ConditionEnum.CENTER:
        return this.center;

      case ConditionEnum.ALL:
        return this.all;

      default:
        throw new Error('Unknown condition');
    }
  }

}
