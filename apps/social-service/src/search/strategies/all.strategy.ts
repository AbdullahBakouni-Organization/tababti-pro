import { Injectable } from '@nestjs/common';
import { SearchStrategy } from './search-strategy.interface';
import { DoctorSearchStrategy } from './doctor-search.strategy';
import { HospitalSearchStrategy } from './hospital-search.strategy';
import { CenterSearchStrategy } from './center-search.strategy';
import { SearchFilterDto } from '../dto/search-filter.dto';

@Injectable()
export class AllSearchStrategy implements SearchStrategy<{
  doctors: { data: any[]; pagination: any };
  hospitals: { data: any[]; pagination: any };
  centers: { data: any[]; pagination: any };
  insuranceCompanies: { data: any[]; pagination: any };
}> {
  constructor(
    private readonly doctor: DoctorSearchStrategy,
    private readonly hospital: HospitalSearchStrategy,
    private readonly center: CenterSearchStrategy,
  ) {}

  async search(
    query: SearchFilterDto,
    skip = 0,
    limit = 10,
    sortBy?: string,
    order?: 'asc' | 'desc',
  ) {
    const [doctors, hospitals, centers] = await Promise.all(
      [
        this.doctor.search({ ...query }, skip, limit, sortBy, order),
        this.hospital.search({ ...query }, skip, limit, sortBy, order),
        this.center.search({ ...query }, skip, limit, sortBy, order)
      ],
    );

    return { doctors, hospitals, centers };
  }
}
