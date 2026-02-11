import {
  IsNotEmpty,
  IsString,
  IsMongoId,
  IsOptional,
  IsEnum,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '@app/common/database/schemas/common.enums';

export class CreateBookingDto {
  @ApiProperty({
    description: 'Patient User ID',
    example: '507f1f77bcf86cd799439011',
  })
  @IsNotEmpty()
  @IsMongoId()
  patientId: string;

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
}

export class BookingResponseDto {
  bookingId: string | undefined;
  patientId: string;
  doctorId: string;
  slotId: string;
  status: string;
  bookingDate: Date;
  bookingTime: string;
  bookingEndTime: string;
  location: {
    type: string;
    entity_name: string;
    address: string;
  };
  price: number;
  createdBy: string;
  note?: string;
  createdAt: Date | undefined;
}
