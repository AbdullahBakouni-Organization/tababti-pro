import { Module, forwardRef } from '@nestjs/common';
import { DoctorSearchQuery } from './doctor-search.query';
import { HospitalSearchQuery } from './hospital-search.query';
import { CenterSearchQuery } from './center-search.query';
import { SearchBuildersModule } from '../builders/search.builders.module';
import { SearchCoreModule } from '../search-core.module';

@Module({
  imports: [
    forwardRef(() => SearchBuildersModule),
    forwardRef(() => SearchCoreModule),
  ],
  providers: [DoctorSearchQuery, HospitalSearchQuery, CenterSearchQuery],
  exports: [DoctorSearchQuery, HospitalSearchQuery, CenterSearchQuery],
})
export class SearchQueriesModule {}
