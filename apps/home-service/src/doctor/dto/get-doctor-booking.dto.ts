import {
  IsOptional,
  IsMongoId,
  IsDateString,
  IsEnum,
  IsString,
  IsArray,
  IsNotEmpty,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { BookingStatus } from '@app/common/database/schemas/common.enums';

/**
 * DTO for querying doctor bookings with advanced filters
 */
export class GetDoctorBookingsDto {
  @ApiProperty({
    description: 'Doctor ID',
    example: '507f1f77bcf86cd799439010',
  })
  @IsMongoId()
  @IsNotEmpty()
  doctorId: string;

  @ApiPropertyOptional({
    description: 'Specific date to filter bookings (YYYY-MM-DD)',
    example: '2026-02-25',
  })
  @IsOptional()
  @IsDateString()
  date?: string;

  @ApiPropertyOptional({
    description: 'Start date for date range filter (YYYY-MM-DD)',
    example: '2026-02-20',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'End date for date range filter (YYYY-MM-DD)',
    example: '2026-02-28',
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({
    description: 'Filter by booking status (can specify multiple)',
    example: ['PENDING', 'CONFIRMED'],
    enum: BookingStatus,
    isArray: true,
  })
  @IsOptional()
  @IsArray()
  @IsEnum(BookingStatus, { each: true })
  @Transform(({ value }) => (Array.isArray(value) ? value : [value]))
  status?: BookingStatus[];

  @ApiPropertyOptional({
    description: 'Filter by location entity name (e.g., hospital/clinic name)',
    example: 'City Medical Center',
  })
  @IsOptional()
  @IsString()
  locationEntityName?: string;

  @ApiPropertyOptional({
    description: 'Filter by location type (HOSPITAL, CLINIC, etc.)',
    example: 'HOSPITAL',
  })
  @IsOptional()
  @IsString()
  locationType?: string;

  @ApiPropertyOptional({
    description: 'Page number (for pagination)',
    example: 1,
    default: 1,
  })
  @IsOptional()
  @Type(() => Number)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Number of items per page',
    example: 20,
    default: 20,
  })
  @IsOptional()
  @Type(() => Number)
  limit?: number = 20;
}

/**
 * Response DTO for a single booking with all details
 */
export class DoctorBookingDetailDto {
  @ApiProperty({ description: 'Booking ID' })
  bookingId: string;

  @ApiProperty({ description: 'Booking status', enum: BookingStatus })
  status: BookingStatus;

  @ApiProperty({ description: 'Booking date' })
  bookingDate: Date;

  @ApiProperty({ description: 'Start time (HH:mm)' })
  bookingTime: string;

  @ApiProperty({ description: 'End time (HH:mm)' })
  bookingEndTime: string;

  @ApiProperty({ description: 'Inspection duration in minutes' })
  inspectionDuration: number;

  @ApiProperty({ description: 'Booking price' })
  price: number;

  @ApiProperty({ description: 'Booking notes (if any)' })
  note?: string;

  @ApiProperty({ description: 'Created at timestamp' })
  createdAt: Date;

  @ApiProperty({ description: 'Completed at timestamp (if completed)' })
  completedAt?: Date;

  @ApiProperty({
    description: 'Cancellation details (if cancelled)',
    required: false,
  })
  cancellation?: {
    cancelledBy: string;
    reason: string;
    cancelledAt: Date;
  };

  @ApiProperty({ description: 'Patient information' })
  patient: {
    patientId: string;
    phone: string;
    gender?: string;
  };

  @ApiProperty({ description: 'Slot information' })
  slot: {
    slotId: string;
    date: Date;
    startTime: string;
    endTime: string;
    status: string;
    location: {
      type: string;
      entity_name: string;
      address: string;
      city?: string;
      coordinates?: {
        latitude: number;
        longitude: number;
      };
    };
  };
}

/**
 * Paginated response DTO
 */
export class GetDoctorBookingsResponseDto {
  @ApiProperty({
    description: 'List of bookings',
    type: [DoctorBookingDetailDto],
  })
  bookings: DoctorBookingDetailDto[];

  @ApiProperty({ description: 'Pagination metadata' })
  pagination: {
    currentPage: number;
    totalPages: number;
    totalItems: number;
    itemsPerPage: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };

  @ApiProperty({ description: 'Summary statistics' })
  summary: {
    totalBookings: number;
    byStatus: {
      [key in BookingStatus]?: number;
    };
    averageDuration: number;
    totalRevenue: number;
  };
}
