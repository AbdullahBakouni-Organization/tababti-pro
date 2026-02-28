import { IsNotEmpty, IsMongoId, IsString, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO for doctor completing a booking
 */
export class DoctorCompleteBookingDto {
  @ApiProperty({
    description: 'Booking ID to complete',
    example: '507f1f77bcf86cd799439015',
  })
  @IsNotEmpty()
  @IsMongoId()
  bookingId: string;

  @ApiProperty({
    description: 'Doctor ID who is completing the booking',
    example: '507f1f77bcf86cd799439010',
  })
  @IsNotEmpty()
  @IsMongoId()
  doctorId: string;

  @ApiProperty({
    description: 'Optional notes about the completed appointment',
    example: 'Patient responded well to treatment',
    required: false,
  })
  @IsOptional()
  @IsString()
  notes?: string;
}

/**
 * Response for booking completion
 */
export class BookingCompletionResponseDto {
  message: string;
  bookingId: string;
  completedAt: Date;
  patientNotified: boolean;
}
