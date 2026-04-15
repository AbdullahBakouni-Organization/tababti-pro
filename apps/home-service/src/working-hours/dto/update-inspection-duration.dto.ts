import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  Equals,
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import { BookingStatus } from '@app/common/database/schemas/common.enums';

export class CheckInspectionDurationConflictDto {
  @ApiProperty({ example: 45, minimum: 15, maximum: 240 })
  @IsNumber()
  @Min(15, { message: 'Inspection duration must be at least 15 minutes' })
  @Max(240, { message: 'Inspection duration cannot exceed 240 minutes' })
  @IsNotEmpty()
  inspectionDuration: number;

  @ApiPropertyOptional({ example: 75.0, minimum: 0 })
  @IsNumber()
  @IsOptional()
  @Min(0, { message: 'Inspection price cannot be negative' })
  inspectionPrice?: number;
}

export class UpdateInspectionDurationDto extends CheckInspectionDurationConflictDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  @IsNotEmpty()
  @Equals(true, { message: 'confirm must be true to proceed with update' })
  confirm: boolean;
}

export class AffectedInspectionBookingDto {
  @ApiProperty()
  bookingId: string;

  @ApiProperty()
  patientId: string;

  @ApiProperty()
  patientName: string;

  @ApiProperty()
  patientContact: string;

  @ApiProperty()
  appointmentDate: Date;

  @ApiProperty()
  appointmentTime: string;

  @ApiProperty({ enum: BookingStatus })
  status: BookingStatus;

  @ApiProperty({
    description: 'true if patient is a registered app user, false if manual',
  })
  isAppPatient: boolean;
}

export class CheckInspectionDurationConflictResponseDto {
  @ApiProperty()
  hasConflicts: boolean;

  @ApiProperty()
  durationChanged: boolean;

  @ApiPropertyOptional({
    description:
      'Null when the doctor has not yet configured an inspection duration (first-time setup).',
    nullable: true,
  })
  currentInspectionDuration: number | null;

  @ApiProperty()
  newInspectionDuration: number;

  @ApiProperty()
  affectedBookingsCount: number;

  @ApiProperty({ type: [AffectedInspectionBookingDto] })
  affectedBookings: AffectedInspectionBookingDto[];

  @ApiPropertyOptional()
  warningMessage?: string;
}
