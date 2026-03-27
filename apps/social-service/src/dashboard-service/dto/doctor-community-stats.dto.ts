// doctor-stats.dto.ts

export class DoctorStatsQueryDto {
  doctorId: string;
}

export class MonthlyStatDto {
  percentage: number; // e.g. 72.5 (%)
  changePercent: number; // e.g. +5.2 or -3.1
  isIncrease: boolean; // true = went up vs last month
}

export class DoctorStatsResponseDto {
  data: {
    stats: {
      answeredQuestionsRate: MonthlyStatDto; // % of questions doctor answered
      rejectedPostsRate: MonthlyStatDto; // % of doctor's posts that are rejected
      approvedPostsRate: MonthlyStatDto; // % of doctor's posts that are approved
    };
  };
}
