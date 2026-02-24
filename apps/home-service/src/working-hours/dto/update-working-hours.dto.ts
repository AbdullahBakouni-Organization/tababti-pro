import { IsBoolean, IsOptional } from 'class-validator';
import { AddWorkingHoursDto } from './add-working-hours.dto';

/**
 * DTO for updating working hours with conflict awareness
 */
export class UpdateWorkingHoursDto extends AddWorkingHoursDto {
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean; // If true, only check for conflicts without updating

  @IsOptional()
  @IsBoolean()
  confirmUpdate?: boolean; // Must be true to proceed if conflicts exist
}

/**
 * Response for conflict check
 */
export class ConflictCheckResponseDto {
  hasConflicts: boolean;
  todayConflicts: ConflictedBooking[];
  futureConflicts: ConflictedBooking[];
  summary: {
    totalConflicts: number;
    todayCount: number;
    futureCount: number;
    affectedPatients: number;
  };
  warningMessage?: string;
}

/**
 * Individual conflicted booking details
 */
export class ConflictedBooking {
  bookingId: string;
  patientId: string;
  patientName: string;
  patientContact: string;
  appointmentDate: Date;
  appointmentTime: string;
  location: {
    type: string;
    entity_name: string;
  };
  reason: string; // Why it conflicts
  isToday: boolean;
}
