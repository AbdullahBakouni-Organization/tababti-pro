import { ApiProperty } from '@nestjs/swagger';
import { Equals, IsBoolean, IsNotEmpty } from 'class-validator';
import { WorkingHourDto } from './add-working-hours.dto';

/**
 * Body for POST /doctors-working-hours/check-delete-conflict.
 * Carries the exact working-hours entry the doctor wants to remove.
 */
export class CheckDeleteConflictDto extends WorkingHourDto {}

/**
 * Body for POST /doctors-working-hours/delete.
 * Same shape as CheckDeleteConflictDto plus an explicit confirm flag.
 */
export class DeleteWorkingHoursDto extends WorkingHourDto {
  @ApiProperty({
    description: 'Must be true to confirm deletion. Prevents accidental calls.',
    example: true,
  })
  @IsBoolean()
  @IsNotEmpty()
  @Equals(true, {
    message: 'confirm must be true to proceed with deletion',
  })
  confirm: boolean;
}

export class AffectedBookingDto {
  bookingId: string;
  patientId: string;
  patientName: string;
  patientContact: string;
  appointmentDate: Date;
  appointmentTime: string;
  status: string;
}

export class CheckDeleteConflictResponseDto {
  hasConflicts: boolean;
  affectedBookingsCount: number;
  affectedBookings: AffectedBookingDto[];
  warningMessage?: string;
}
