import {
  IsNotEmpty,
  IsMongoId,
  IsString,
  IsOptional,
  IsDateString,
  IsBoolean,
  ValidateIf,
  IsEnum,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { SlotStatus } from '@app/common/database/schemas/common.enums';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Days } from '@app/common/database/schemas/common.enums';
/* ============================================================================
   SCENARIO 1: VIP BOOKING (Doctor Creates Manual Booking)
============================================================================ */

/**
 * DTO for getting ALL slots (including booked ones) for VIP booking
 */

export class GetAllSlotsDto {
  @ApiPropertyOptional({
    description: 'Date to get slots for (YYYY-MM-DD)',
    example: '2026-02-17',
  })
  @IsOptional()
  @IsDateString()
  @ValidateIf((o) => !o.dayName) // required if dayName not provided
  date?: string;

  @ApiPropertyOptional({
    description: 'Day name to get recurring slots for',
    enum: Days,
    example: 'Monday',
  })
  @IsOptional()
  @IsEnum(Days)
  @ValidateIf((o) => !o.date) // required if date not provided
  dayName?: Days;
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
 * DTO for creating VIP booking (confirmed).
 *
 * Mutual-exclusivity constraint — exactly ONE of the two groups below must be provided:
 *   Group A (existing DB patient): vipPatientId
 *   Group B (manual patient):      patientName + patientAddress + patientPhone
 *
 * Rules enforced at the DTO level:
 *   • If vipPatientId is present, the three manual-patient fields must be absent.
 *   • If any manual-patient field is present, vipPatientId must be absent and all
 *     three manual-patient fields must be present.
 *   • Having neither group is invalid (service-level guard provides the fallback).
 */
export class CreateVIPBookingDto {
  @ApiProperty({
    description: 'Slot ID to book',
    example: '507f1f77bcf86cd799439020',
  })
  @IsNotEmpty()
  @IsMongoId()
  slotId: string;

  // ── Group A: existing DB patient ────────────────────────────────────────────

  @ApiPropertyOptional({
    description:
      'ID of an existing patient in the database. Mutually exclusive with the manual-patient fields.',
    example: '507f1f77bcf86cd799439011',
  })
  @ValidateIf(
    (o: CreateVIPBookingDto) =>
      !o.patientName && !o.patientAddress && !o.patientPhone,
  )
  @IsNotEmpty()
  @IsMongoId()
  vipPatientId?: string;

  // ── Group B: manual patient (not in the database) ───────────────────────────

  @ApiPropertyOptional({
    description:
      'Full name of the manual patient. Required when the patient is not in the database. Mutually exclusive with vipPatientId.',
    example: 'Ahmad Al-Khalidi',
  })
  @ValidateIf(
    (o: CreateVIPBookingDto) =>
      !o.vipPatientId &&
      (o.patientAddress !== undefined || o.patientPhone !== undefined),
  )
  @IsNotEmpty()
  @IsString()
  patientName?: string;

  @ApiPropertyOptional({
    description: 'Address of the manual patient.',
    example: 'Damascus, Al-Mazzeh district',
  })
  @ValidateIf(
    (o: CreateVIPBookingDto) =>
      !o.vipPatientId &&
      (o.patientName !== undefined || o.patientPhone !== undefined),
  )
  @IsNotEmpty()
  @IsString()
  patientAddress?: string;

  @ApiPropertyOptional({
    description: 'Phone number of the manual patient.',
    example: '+963912345678',
  })
  @ValidateIf(
    (o: CreateVIPBookingDto) =>
      !o.vipPatientId &&
      (o.patientName !== undefined || o.patientAddress !== undefined),
  )
  @IsNotEmpty()
  @IsString()
  patientPhone?: string;

  // ── Shared fields ───────────────────────────────────────────────────────────

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

  @ApiPropertyOptional({
    description: 'Optional note for the booking',
    example: 'VIP patient - handle with care',
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
 * Job data for VIP booking Bull job.
 * Exactly one of (vipPatientId) OR (patientName + patientAddress + patientPhone) must
 * be present — mirroring the mutual-exclusivity on CreateVIPBookingDto.
 */
export interface VIPBookingJobData {
  doctorId: string;
  doctorName: string;
  slotId: string;
  /** Present when booking an existing DB patient. */
  vipPatientId?: string;
  /** Present when booking a manual patient not in the database. */
  patientName?: string;
  patientAddress?: string;
  patientPhone?: string;
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
