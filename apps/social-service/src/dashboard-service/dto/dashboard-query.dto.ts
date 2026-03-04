import {
  IsOptional,
  IsInt,
  Min,
  Max,
  IsDateString,
  IsIn,
  IsString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

// ═══════════════════════════════════════════════════════════════
// QUERY DTOs (for @Query() parameters)
// ═══════════════════════════════════════════════════════════════

export class DashboardQueryDto {
  @ApiProperty({
    example: '2026-03-02',
    required: false,
    description: 'Reference date in YYYY-MM-DD format',
  })
  @IsOptional()
  @IsDateString()
  selectedDate?: string;

  @ApiProperty({
    enum: ['week', 'month'],
    example: 'week',
    required: false,
    description: 'Period for location chart',
  })
  @IsOptional()
  @IsIn(['week', 'month'])
  period?: 'week' | 'month';

  @ApiProperty({ example: 1, required: false })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiProperty({ example: 10, required: false })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class CalendarQueryDto {
  @ApiProperty({ example: 2026, description: 'Full year' })
  @Type(() => Number)
  @IsInt()
  year: number;

  @ApiProperty({ example: 3, description: 'Month 1-12' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month: number;
}

export class LocationChartQueryDto {
  @ApiProperty({
    enum: ['week', 'month'],
    example: 'week',
    required: false,
  })
  @IsOptional()
  @IsIn(['week', 'month'])
  period?: 'week' | 'month';

  @ApiProperty({
    example: '2026-03-02',
    required: false,
    description: 'Reference point for the period',
  })
  @IsOptional()
  @IsDateString()
  selectedDate?: string;
}

export class AppointmentsQueryDto {
  @ApiProperty({
    example: '2026-03-02',
    required: false,
    description: 'Filter by exact day',
  })
  @IsOptional()
  @IsDateString()
  date?: string;

  @ApiProperty({
    example: '2026-03-02',
    required: false,
    description: 'Filter by month',
  })
  @IsOptional()
  @IsDateString()
  monthDate?: string;

  @ApiProperty({ example: 'CONFIRMED', required: false })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiProperty({ example: 1, required: false })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiProperty({ example: 10, required: false })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class StatsQueryDto {
  @ApiProperty({
    example: '2026-03-02',
    required: false,
    description: 'Reference date, defaults to today',
  })
  @IsOptional()
  @IsDateString()
  selectedDate?: string;
}

export class GenderStatsQueryDto {
  @ApiProperty({
    example: '2026-03-02',
    required: false,
    description: 'Reference date, defaults to today',
  })
  @IsOptional()
  @IsDateString()
  selectedDate?: string;
}

// ═══════════════════════════════════════════════════════════════
// RESPONSE DTOs (for consistent API responses)
// ═══════════════════════════════════════════════════════════════

export class ApiResponseDto<T> {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ example: 'Data retrieved successfully' })
  message: string;

  @ApiProperty({ example: 200 })
  statusCode: number;

  data?: T;

  errors?: string[];

  timestamp?: string;
}

export class DashboardStatsDto {
  @ApiProperty({ example: 25 })
  totalAppointments: number;

  @ApiProperty({ example: 20 })
  completedAppointments: number;

  @ApiProperty({ example: 5 })
  incompleteAppointments: number;

  @ApiProperty({ example: 5000 })
  estimatedRevenue: number;

  @ApiProperty({ example: 15 })
  revenueChangePercent: number;
}

export class RecentPatientDto {
  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  patientId: string;

  @ApiProperty({ example: 'Ahmed Hassan' })
  name: string;

  @ApiProperty({ example: 'https://...' })
  image?: string;

  @ApiProperty({ example: 'Al-Noor Hospital' })
  locationName: string;

  @ApiProperty({ example: 'PENDING' })
  status: string;

  @ApiProperty({ example: '2026-03-02T10:00:00Z' })
  bookingDate: Date;
}

export class CalendarDayDto {
  @ApiProperty({ example: '2026-03-01' })
  date: string;

  @ApiProperty({ example: 3 })
  appointmentCount: number;

  @ApiProperty({ example: true })
  hasAppointments: boolean;
}

export class CalendarMonthDto {
  @ApiProperty({ example: 2026 })
  year: number;

  @ApiProperty({ example: 3 })
  month: number;

  @ApiProperty({ type: [CalendarDayDto] })
  days: CalendarDayDto[];
}

export class AppointmentRowDto {
  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  bookingId: string;

  @ApiProperty({ example: 'Fatima Ahmed' })
  patientName: string;

  @ApiProperty({ example: 'https://...' })
  patientImage?: string;

  @ApiProperty({ example: 'F' })
  gender: string;

  @ApiProperty({ example: '10:00' })
  time: string;

  @ApiProperty({ example: '2026/03/02' })
  date: string;

  @ApiProperty({ example: 'Al-Noor Hospital' })
  locationName: string;

  @ApiProperty({ example: 'CONFIRMED' })
  status: string;
}

export class AppointmentsTableResultDto {
  @ApiProperty({ type: [AppointmentRowDto] })
  appointments: AppointmentRowDto[];

  @ApiProperty({ example: 42 })
  total: number;

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 5 })
  totalPages: number;
}

export class GenderStatsDto {
  @ApiProperty({ example: 15 })
  maleCount: number;

  @ApiProperty({ example: 10 })
  femaleCount: number;

  @ApiProperty({ example: 25 })
  totalPatients: number;

  @ApiProperty({ example: 60.0 })
  malePercent: number;

  @ApiProperty({ example: 40.0 })
  femalePercent: number;

  @ApiProperty({ example: 83.0 })
  completionPercent: number;
}

export class LocationChartDataPointDto {
  @ApiProperty({ example: 'Mon' })
  label: string;

  @ApiProperty({ example: '2026-03-02' })
  date: string;

  @ApiProperty({ example: 5 })
  clinic: number;

  @ApiProperty({ example: 3 })
  hospital: number;

  @ApiProperty({ example: 2 })
  center: number;
}

export class LocationChartDto {
  @ApiProperty({ type: [LocationChartDataPointDto] })
  data: LocationChartDataPointDto[];

  @ApiProperty({ example: 20 })
  totalClinic: number;

  @ApiProperty({ example: 15 })
  totalHospital: number;

  @ApiProperty({ example: 10 })
  totalCenter: number;

  @ApiProperty({ example: 45 })
  totalAppointments: number;
}

export class DoctorDashboardDto {
  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  doctorId: string;

  @ApiProperty({ example: 'Dr. Majdi Jarjes' })
  doctorName: string;

  @ApiProperty({ example: 'https://...' })
  doctorImage?: string;

  @ApiProperty({ type: DashboardStatsDto })
  stats: DashboardStatsDto;

  @ApiProperty({ type: [RecentPatientDto] })
  recentPatients: RecentPatientDto[];

  @ApiProperty({ type: CalendarMonthDto })
  calendar: CalendarMonthDto;

  @ApiProperty({ type: AppointmentsTableResultDto })
  appointments: AppointmentsTableResultDto;

  @ApiProperty({ type: GenderStatsDto })
  genderStats: GenderStatsDto;

  @ApiProperty({ type: LocationChartDto })
  locationChart: LocationChartDto;
}
