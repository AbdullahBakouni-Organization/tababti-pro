import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsMongoId,
  IsOptional,
  IsEnum,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { BookingStatus } from '@app/common/database/schemas/common.enums';

export class PatientDetailDto {
  @ApiProperty({
    description: 'Patient MongoDB ID',
    example: '507f1f77bcf86cd799439011',
  })
  @IsMongoId()
  patientId: string;

  @ApiPropertyOptional({
    enum: BookingStatus,
    description: 'Filter booking history by status',
    example: BookingStatus.COMPLETED,
  })
  @IsOptional()
  @IsEnum(BookingStatus)
  status?: BookingStatus;

  @ApiPropertyOptional({
    description: 'Page number (default: 1)',
    example: 1,
    default: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Items per page, max 50 (default: 10)',
    example: 10,
    default: 10,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 10;
}
