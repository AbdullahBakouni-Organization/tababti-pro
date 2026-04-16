import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { BookingStatus } from '@app/common/database/schemas/common.enums';

export type ReclassifiableCancellationStatus =
  | BookingStatus.CANCELLED_BY_DOCTOR
  | BookingStatus.CANCELLED_BY_PATIENT
  | BookingStatus.CANCELLED_BY_SYSTEM;

export const RECLASSIFIABLE_CANCELLATION_STATUSES: ReclassifiableCancellationStatus[] =
  [
    BookingStatus.CANCELLED_BY_DOCTOR,
    BookingStatus.CANCELLED_BY_PATIENT,
    BookingStatus.CANCELLED_BY_SYSTEM,
  ];

export class ReclassifyCancellationDto {
  @ApiProperty({
    description:
      'ID of the booking whose cancellation attribution will be changed. Booking must currently be in CANCELLED_BY_SYSTEM.',
    example: '507f1f77bcf86cd799439011',
  })
  @IsNotEmpty()
  @IsMongoId()
  bookingId: string;

  @ApiProperty({
    description:
      'New cancellation attribution for the booking. Restricted to the three outcomes a doctor is allowed to reclassify a system-cancelled booking into.',
    enum: RECLASSIFIABLE_CANCELLATION_STATUSES,
    example: BookingStatus.CANCELLED_BY_PATIENT,
  })
  @IsNotEmpty()
  @IsEnum(RECLASSIFIABLE_CANCELLATION_STATUSES)
  targetStatus: ReclassifiableCancellationStatus;

  @ApiPropertyOptional({
    description:
      'Optional note describing why the doctor is reclassifying the cancellation. Overwrites the previous system-generated reason when provided.',
    example: 'Patient called and confirmed they could not attend.',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class ReclassifyCancellationResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  bookingId: string;

  @ApiProperty({
    enum: RECLASSIFIABLE_CANCELLATION_STATUSES,
    example: BookingStatus.CANCELLED_BY_PATIENT,
  })
  previousStatus: BookingStatus;

  @ApiProperty({
    enum: RECLASSIFIABLE_CANCELLATION_STATUSES,
    example: BookingStatus.CANCELLED_BY_PATIENT,
  })
  newStatus: ReclassifiableCancellationStatus;

  @ApiProperty({
    example: 'Booking cancellation successfully reclassified',
  })
  message: string;
}
