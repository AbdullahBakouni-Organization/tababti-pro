import { Injectable } from '@nestjs/common';
import { SearchFilterDto } from '../dto/search-filter.dto';
import { DoctorSearchQuery } from '../queries/doctor-search.query';
import { HospitalSearchQuery } from '../queries/hospital-search.query';
import { CenterSearchQuery } from '../queries/center-search.query';
import { SearchEnhancerService } from '../enhancers/search-enhancer.service';
import { ConditionEnum } from '@app/common/database/schemas/common.enums';
import { Doctor } from '@app/common/database/schemas/doctor.schema';
import { Hospital } from '@app/common/database/schemas/hospital.schema';
import { Center } from '@app/common/database/schemas/center.schema';
import { SearchResult } from '../interfaces/search-result.interface';

@Injectable()
export class SearchOrchestratorService {
  constructor(
    private readonly doctorQuery: DoctorSearchQuery,
    private readonly hospitalQuery: HospitalSearchQuery,
    private readonly centerQuery: CenterSearchQuery,
    private readonly enhancer: SearchEnhancerService,
  ) {}

  async searchAll(dto: SearchFilterDto) {
    const { search, page = 1 } = dto;

    if (search?.trim()) await this.enhancer.trigger(search.trim());

    let doctorsResult: SearchResult<Doctor> = {
      data: [],
      total: 0,
      page,
      pages: 0,
    };
    let hospitalsResult: SearchResult<Hospital> = {
      data: [],
      total: 0,
      page,
      pages: 0,
    };
    let centersResult: SearchResult<Center> = {
      data: [],
      total: 0,
      page,
      pages: 0,
    };

    switch (dto.condition) {
      case ConditionEnum.DOCTORS:
        doctorsResult = await this.doctorQuery.execute(dto);
        break;
      case ConditionEnum.HOSPITAL:
        hospitalsResult = await this.hospitalQuery.execute(dto);
        break;
      case ConditionEnum.CENTER:
        centersResult = await this.centerQuery.execute(dto);
        break;
      case ConditionEnum.ALL:
      default:
        [doctorsResult, hospitalsResult, centersResult] = await Promise.all([
          this.doctorQuery.execute(dto),
          this.hospitalQuery.execute(dto),
          this.centerQuery.execute(dto),
        ]);
    }

    return {
      doctors: doctorsResult,
      hospitals: hospitalsResult,
      centers: centersResult,
    };
  }
}
