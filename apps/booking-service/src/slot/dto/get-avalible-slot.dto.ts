import {
  IsNotEmpty,
  IsMongoId,
  IsDateString,
  IsOptional,
  IsEnum,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { WorkigEntity } from '@app/common/database/schemas/common.enums';

/**
 * DTO for getting available slots
 */
export class GetAvailableSlotsDto {
  @ApiProperty({
    description: 'Doctor ID',
    example: '507f1f77bcf86cd799439010',
  })
  @IsNotEmpty()
  @IsMongoId()
  doctorId: string;

  @ApiProperty({
    description:
      'Specific date (YYYY-MM-DD). If provided, startDate and endDate are ignored.',
    example: '2026-02-20',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  date?: string;

  @ApiProperty({
    description: 'Start date (YYYY-MM-DD)',
    example: '2026-02-15',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiProperty({
    description: 'End date (YYYY-MM-DD)',
    example: '2026-02-22',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiProperty({
    description: 'Filter by location entity name',
    example: 'City Medical Center',
    required: false,
  })
  @IsOptional()
  @IsEnum(WorkigEntity)
  location?: WorkigEntity;
}

/**
 * Response DTO for available slots
 */
export class AvailableSlotDto {
  slotId: string;
  doctorId: string;
  doctorName: string;
  date: Date;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  duration: number;
  price: number;
  location: {
    type: string;
    entity_name: string;
    address: string;
  };
  status: string;
}
export class GroupedAvailableSlotsDto {
  clinic: { data: AvailableSlotDto[]; total: number };
  hospital: { data: AvailableSlotDto[]; total: number };
  center: { data: AvailableSlotDto[]; total: number };
}
