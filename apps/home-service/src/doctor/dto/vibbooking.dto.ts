import {
  IsNotEmpty,
  IsMongoId,
  IsString,
  IsOptional,
  IsDateString,
  IsBoolean,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { SlotStatus } from '@app/common/database/schemas/common.enums';

/* ============================================================================
   SCENARIO 1: VIP BOOKING (Doctor Creates Manual Booking)
============================================================================ */

/**
 * DTO for getting ALL slots (including booked ones) for VIP booking
 */
export class GetAllSlotsDto {
  @ApiProperty({
    description: 'Doctor ID',
    example: '507f1f77bcf86cd799439010',
  })
  @IsNotEmpty()
  @IsMongoId()
  doctorId: string;

  @ApiProperty({
    description: 'Date to get slots for (YYYY-MM-DD)',
    example: '2026-02-17',
  })
  @IsNotEmpty()
  @IsDateString()
  date: string;
}

/**
 * Response DTO for all slots (including booked)
 */
export class AllSlotsResponseDto {
  slotId: string;
  date: Date;
  startTime: string;
  endTime: string;
  status: 'AVAILABLE' | 'BOOKED' | 'PAUSED' | 'BLOCKED';
  location: {
    type: string;
    entity_name: string;
    address: string;
  };
  existingBooking?: {
    bookingId: string;
    patientId: string;
    patientName: string;
    patientPhone: string;
    bookingStatus: string;
  };
}

/**
 * DTO for creating VIP booking (check conflicts first)
 */
export class CheckVIPBookingConflictDto {
  @ApiProperty({
    description: 'Doctor ID',
    example: '507f1f77bcf86cd799439010',
  })
  @IsNotEmpty()
  @IsMongoId()
  doctorId: string;

  @ApiProperty({
    description: 'Slot ID to book',
    example: '507f1f77bcf86cd799439020',
  })
  @IsNotEmpty()
  @IsMongoId()
  slotId: string;
}

/**
 * Response for VIP booking conflict check
 */
export class VIPBookingConflictResponseDto {
  hasConflict: boolean;
  slotStatus: SlotStatus;
  conflictDetails?: {
    existingBookingId: string;
    patientId: string;
    patientName: string;
    patientPhone: string;
    appointmentTime: string;
  };
  warningMessage?: string;
  canProceed: boolean;
}

/**
 * DTO for creating VIP booking (confirmed)
 */
export class CreateVIPBookingDto {
  @ApiProperty({
    description: 'Doctor ID',
    example: '507f1f77bcf86cd799439010',
  })
  @IsNotEmpty()
  @IsMongoId()
  doctorId: string;

  @ApiProperty({
    description: 'Slot ID to book',
    example: '507f1f77bcf86cd799439020',
  })
  @IsNotEmpty()
  @IsMongoId()
  slotId: string;

  @ApiProperty({
    description: 'VIP Patient ID',
    example: '507f1f77bcf86cd799439011',
  })
  @IsNotEmpty()
  @IsMongoId()
  vipPatientId: string;

  @ApiProperty({
    description: 'Reason for VIP booking (shown to displaced patient)',
    example: 'VIP patient - priority booking',
  })
  @IsNotEmpty()
  @IsString()
  reason: string;

  @ApiProperty({
    description: 'Confirm override if slot is already booked',
    example: true,
  })
  @IsNotEmpty()
  @IsBoolean()
  confirmOverride: boolean;

  @ApiProperty({
    description: 'Optional note for the booking',
    example: 'VIP patient - handle with care',
    required: false,
  })
  @IsOptional()
  @IsString()
  note?: string;
}

/* ============================================================================
   SCENARIO 2: DOCTOR HOLIDAYS (Block Date Range)
============================================================================ */

/**
 * DTO for checking holiday conflicts
 */
export class CheckHolidayConflictDto {
  @ApiProperty({
    description: 'Doctor ID',
    example: '507f1f77bcf86cd799439010',
  })
  @IsNotEmpty()
  @IsMongoId()
  doctorId: string;

  @ApiProperty({
    description: 'Holiday start date (YYYY-MM-DD)',
    example: '2026-02-20',
  })
  @IsNotEmpty()
  @IsDateString()
  startDate: string;

  @ApiProperty({
    description: 'Holiday end date (YYYY-MM-DD)',
    example: '2026-02-25',
  })
  @IsNotEmpty()
  @IsDateString()
  endDate: string;

  @ApiProperty({
    description: 'Reason for holiday',
    example: 'Personal vacation',
  })
  @IsOptional()
  @IsString()
  reason: string;
}

/**
 * Response for holiday conflict check
 */
export class HolidayConflictResponseDto {
  hasConflicts: boolean;
  affectedBookings: Array<{
    bookingId: string;
    patientId: string;
    patientName: string;
    patientPhone: string;
    appointmentDate: Date;
    appointmentTime: string;
    location: any;
  }>;
  affectedSlots: {
    totalSlots: number;
    dates: string[];
  };
  summary: {
    totalBookings: number;
    totalSlots: number;
    dateRange: string;
    daysCount: number;
  };
  warningMessage?: string;
}

/**
 * DTO for creating holiday (confirmed)
 */
export class CreateHolidayDto {
  @ApiProperty({
    description: 'Doctor ID',
    example: '507f1f77bcf86cd799439010',
  })
  @IsNotEmpty()
  @IsMongoId()
  doctorId: string;

  @ApiProperty({
    description: 'Holiday start date (YYYY-MM-DD)',
    example: '2026-02-20',
  })
  @IsNotEmpty()
  @IsDateString()
  startDate: string;

  @ApiProperty({
    description: 'Holiday end date (YYYY-MM-DD)',
    example: '2026-02-25',
  })
  @IsNotEmpty()
  @IsDateString()
  endDate: string;

  @ApiProperty({
    description: 'Reason for holiday',
    example: 'Personal vacation',
  })
  @IsNotEmpty()
  @IsString()
  reason: string;

  @ApiProperty({
    description: 'Confirm holiday even if bookings exist',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  confirmHoliday?: boolean;
}

/**
 * Job data for VIP booking Bull job
 */
export interface VIPBookingJobData {
  doctorId: string;
  doctorName: string;
  slotId: string;
  vipPatientId: string;
  existingBookingId: string | null;
  reason: string;
  note?: string;
}

/**
 * Job data for Holiday blocking Bull job
 */
export interface HolidayBlockJobData {
  doctorId: string;
  doctorName: string;
  startDate?: Date;
  endDate?: Date;
  reason: string;
  affectedBookingIds: string[];
  affectedSlotIds: string[];
}
