import { ApiProperty } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsMongoId,
  IsOptional,
  IsInt,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { WorkigEntity } from '@app/common/database/schemas/common.enums';

export class GetDoctorBookingsByLocationDto {
  @ApiProperty({ description: 'Doctor ID', type: String })
  @IsMongoId()
  doctorId: string;

  @ApiProperty({ enum: WorkigEntity, description: 'Slot location type' })
  @IsEnum(WorkigEntity)
  locationType: WorkigEntity;

  @ApiProperty({
    description: 'Booking date in YYYY-MM-DD format',
    type: String,
  })
  @IsDateString()
  bookingDate: string;

  @ApiProperty({
    description: 'Page number',
    type: Number,
    default: 1,
    required: false,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiProperty({
    description: 'Number of items per page',
    type: Number,
    default: 10,
    required: false,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 10;
}
