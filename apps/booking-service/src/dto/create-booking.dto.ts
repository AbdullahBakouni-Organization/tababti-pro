import {
  IsNotEmpty,
  IsString,
  IsMongoId,
  IsOptional,
  IsEnum,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '@app/common/database/schemas/common.enums';

/**
 * Mutual-exclusivity rule:
 *   - A regular booking has no manual-patient fields (they are all absent / null).
 *   - A manual-patient booking (createdBy DOCTOR) has patientName + patientAddress +
 *     patientPhone all set.
 *   - It is invalid to supply only some of the three manual-patient fields.
 *
 * Note: patientId is NOT part of this DTO — it is always extracted from the JWT by the
 * controller.  Service-level enforcement prevents a manual-patient booking from being
 * created through an endpoint that always has an authenticated patientId.
 */
export class CreateBookingDto {
  @ApiProperty({
    description: 'Doctor ID',
    example: '507f1f77bcf86cd799439012',
  })
  @IsNotEmpty()
  @IsMongoId()
  doctorId: string;

  @ApiProperty({
    description: 'Appointment Slot ID',
    example: '507f1f77bcf86cd799439013',
  })
  @IsNotEmpty()
  @IsMongoId()
  slotId: string;

  @ApiProperty({
    description: 'Optional note for the booking',
    example: 'First time visit',
    required: false,
  })
  @IsOptional()
  @IsString()
  note?: string;

  @ApiProperty({
    description: 'Who is creating the booking',
    enum: [UserRole.USER, UserRole.DOCTOR],
    example: UserRole.USER,
  })
  @IsNotEmpty()
  @IsEnum([UserRole.USER, UserRole.DOCTOR])
  createdBy: UserRole.USER | UserRole.DOCTOR;

  // ── Manual-patient fields (mutually required when any one is present) ───────

  @ApiPropertyOptional({
    description:
      'Full name of the manual patient. Required when booking a patient not in the database.',
    example: 'Ahmad Al-Khalidi',
  })
  @ValidateIf(
    (o: CreateBookingDto) =>
      o.patientAddress !== undefined || o.patientPhone !== undefined,
  )
  @IsNotEmpty()
  @IsString()
  patientName?: string;

  @ApiPropertyOptional({
    description: 'Address of the manual patient.',
    example: 'Damascus, Al-Mazzeh district',
  })
  @ValidateIf(
    (o: CreateBookingDto) =>
      o.patientName !== undefined || o.patientPhone !== undefined,
  )
  @IsNotEmpty()
  @IsString()
  patientAddress?: string;

  @ApiPropertyOptional({
    description: 'Phone number of the manual patient.',
    example: '+963912345678',
  })
  @ValidateIf(
    (o: CreateBookingDto) =>
      o.patientName !== undefined || o.patientAddress !== undefined,
  )
  @IsNotEmpty()
  @IsString()
  patientPhone?: string;
}

export class BookingResponseDto {
  success: boolean;
  message?: string;
}
