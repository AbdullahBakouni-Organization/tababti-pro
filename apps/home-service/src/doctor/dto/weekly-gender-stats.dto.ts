import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';

export class WeeklyGenderStatsQueryDto {
  @ApiProperty({
    example: '2026-04-18',
    required: false,
    description:
      'End of the 6-day window (inclusive), in YYYY-MM-DD format. Defaults to today.',
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}

export class WeeklyGenderDayDto {
  @ApiProperty({ example: 'Sa' })
  day: string;

  @ApiProperty({ example: '2026-04-13' })
  date: string;

  @ApiProperty({ example: 18 })
  male: number;

  @ApiProperty({ example: 14 })
  female: number;
}

export class WeeklyGenderPeriodDto {
  @ApiProperty({ example: '2026-04-13' })
  startDate: string;

  @ApiProperty({ example: '2026-04-18' })
  endDate: string;
}

export class WeeklyGenderStatsDataDto {
  @ApiProperty({ type: WeeklyGenderPeriodDto })
  period: WeeklyGenderPeriodDto;

  @ApiProperty({ type: [WeeklyGenderDayDto] })
  days: WeeklyGenderDayDto[];
}

export class WeeklyGenderStatsResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ type: WeeklyGenderStatsDataDto })
  data: WeeklyGenderStatsDataDto;
}
