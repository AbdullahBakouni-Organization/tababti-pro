import { Module, forwardRef } from '@nestjs/common';
import { DoctorSearchQuery } from './doctor-search.query';
import { HospitalSearchQuery } from './hospital-search.query';
import { CenterSearchQuery } from './center-search.query';
import { SearchBuildersModule } from '../builders/search.builders.module';
import { SearchCoreModule } from '../search-core.module';
import { HospitalIncludeEnhancer } from '../enhancers/hospital-include.enhancer';
import { SearchEnhancerService } from '../enhancers/search-enhancer.service';

@Module({
  imports: [
    forwardRef(() => SearchBuildersModule),
    forwardRef(() => SearchCoreModule),
  ],
  providers: [
    DoctorSearchQuery,
    HospitalSearchQuery,
    CenterSearchQuery,
    HospitalIncludeEnhancer,
    SearchEnhancerService,
  ],
  exports: [
    DoctorSearchQuery,
    HospitalSearchQuery,
    CenterSearchQuery,
    SearchEnhancerService,
  ],
})
export class SearchQueriesModule {}
