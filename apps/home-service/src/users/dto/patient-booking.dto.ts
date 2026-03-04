import { IsNotEmpty, IsMongoId } from 'class-validator';
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
