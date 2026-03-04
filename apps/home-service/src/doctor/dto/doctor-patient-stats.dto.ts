// dto/doctor-patient-stats.dto.ts
export interface GenderBreakdownDto {
  count: number;
  percentage: number;
}

export interface DoctorPatientStatsDto {
  doctorId: string;
  doctorName: string;
  totalPatients: number;
  uniquePatients: number;
  gender: {
    male: GenderBreakdownDto;
    female: GenderBreakdownDto;
    unknown: GenderBreakdownDto;
  };
  lastUpdated: Date;
  nextUpdateAt: Date;
}
