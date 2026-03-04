// doctor-booking-action.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsMongoId, IsNotEmpty } from 'class-validator';

export class RescheduleBookingDto {
  @ApiProperty({ example: '64f1a2b3c4d5e6f7a8b9c0d1' })
  @IsMongoId()
  @IsNotEmpty()
  bookingId: string;
}
