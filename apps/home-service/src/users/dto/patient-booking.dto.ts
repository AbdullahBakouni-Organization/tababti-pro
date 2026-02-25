import { IsNotEmpty, IsMongoId, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO for patient cancelling their own booking
 */
export class PatientCancelBookingDto {
  @ApiProperty({
    description: 'Booking ID to cancel',
    example: '507f1f77bcf86cd799439015',
  })
  @IsNotEmpty()
  @IsMongoId()
  bookingId: string;

  @ApiProperty({
    description: 'Patient ID who is cancelling',
    example: '507f1f77bcf86cd799439011',
  })
  @IsNotEmpty()
  @IsMongoId()
  patientId: string;
}

/**
 * Response for cancellation
 */
export class CancellationResponseDto {
  message: string;
  bookingId: string;
  cancelled: boolean;
  remainingCancellationsToday: number;
}

/**
 * Booking validation response
 */
export class BookingValidationResponseDto {
  canBook: boolean;
  reason?: string;
  currentBookingsWithDoctor: number;
  currentBookingsToday: number;
  maxBookingsWithDoctor: number;
  maxBookingsPerDay: number;
}
