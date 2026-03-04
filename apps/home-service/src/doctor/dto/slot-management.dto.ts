import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsDateString,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

/**
 * DTO for pausing slots
 */
export class PauseSlotsDto {
  @ApiProperty({
    description: 'Array of slot IDs to pause',
    example: ['507f1f77bcf86cd799439013', '507f1f77bcf86cd799439014'],
    type: [String],
  })
  @IsNotEmpty()
  @IsArray()
  @IsMongoId({ each: true })
  slotIds: string[];

  @ApiProperty({
    description: 'Reason for pausing slots',
    example: 'Emergency - Doctor unavailable',
  })
  @IsNotEmpty()
  @IsString()
  reason: string;

  @ApiProperty({
    description:
      'Date for which slots should be paused (YYYY-MM-DD). Defaults to today.',
    example: '2026-02-15',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  pauseDate?: string;

  @ApiProperty({
    description: 'Confirm pausing even if conflicts exist',
    example: false,
    required: false,
  })
  @IsOptional()
  confirmPause?: boolean;
}

/**
 * Response for pause slot conflict check
 */
export class PauseSlotConflictDto {
  hasConflicts: boolean;
  affectedBookings: {
    bookingId: string;
    patientId: string;
    patientName: string;
    patientPhone: string;
    slotTime: string;
    fcmToken?: string;
  }[];
  summary: {
    totalAffected: number;
    slotsCount: number;
  };
  warningMessage?: string;
}

/**
 * DTO for doctor canceling a booking
 */
export class DoctorCancelBookingDto {
  @ApiProperty({
    description: 'Reason for cancellation',
    example: 'Doctor emergency - need to reschedule',
  })
  @IsNotEmpty()
  @IsString()
  reason: string;

  @ApiProperty({
    description: 'Doctor ID performing the cancellation',
    example: '507f1f77bcf86cd799439010',
  })
  @IsNotEmpty()
  @IsMongoId()
  bookingId: string;
}

export interface PauseSlotsJobData {
  doctorId: string;
  slotIds: string[];
  reason: string;
  pauseDate: Date;
  affectedBookingIds: string[];
  doctorInfo: {
    fullName: string;
  };
}
