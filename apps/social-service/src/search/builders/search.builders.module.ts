import { Module, forwardRef } from '@nestjs/common';
import { BaseConditionBuilder } from './base-condition.builder';
import { DoctorConditionBuilder } from './doctor-condition.builder';
import { HospitalConditionBuilder } from './hospital-condition.builder';
import { CenterConditionBuilder } from './center-condition.builder';
import { SearchCoreModule } from '../search-core.module';

@Module({
  imports: [forwardRef(() => SearchCoreModule)],
  providers: [
    BaseConditionBuilder,
    DoctorConditionBuilder,
    HospitalConditionBuilder,
    CenterConditionBuilder,
  ],
  exports: [
    BaseConditionBuilder,
    DoctorConditionBuilder,
    HospitalConditionBuilder,
    CenterConditionBuilder,
  ],
})
export class SearchBuildersModule {}
