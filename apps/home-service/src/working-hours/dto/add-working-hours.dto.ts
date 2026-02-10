import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsString,
  Matches,
  ValidateNested,
  ArrayMinSize,
  IsNumber,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { Days, WorkigEntity } from '@app/common/database/schemas/common.enums';

export class WorkingLocationDto {
  @ApiProperty({
    enum: WorkigEntity,
    description: 'Type of working entity',
    example: WorkigEntity.CLINIC,
  })
  @IsEnum(WorkigEntity)
  @IsNotEmpty()
  type: WorkigEntity;

  @ApiProperty({
    description: 'Name of the entity (clinic, hospital, etc.)',
    example: 'City Medical Clinic',
  })
  @IsString()
  @IsNotEmpty()
  entity_name: string;

  @ApiProperty({
    description: 'Physical address of the location',
    example: '123 Main St, Downtown',
  })
  @IsString()
  @IsNotEmpty()
  address: string;
}

export class WorkingHourDto {
  @ApiProperty({
    enum: Days,
    description: 'Day of the week',
    example: Days.MONDAY,
  })
  @IsEnum(Days)
  @IsNotEmpty()
  day: Days;

  @ApiProperty({
    type: WorkingLocationDto,
    description: 'Location details where doctor works',
  })
  @ValidateNested()
  @Type(() => WorkingLocationDto)
  @IsNotEmpty()
  location: WorkingLocationDto;

  @ApiProperty({
    description: 'Start time in HH:mm format (24-hour)',
    example: '09:00',
    pattern: '^([0-1][0-9]|2[0-3]):[0-5][0-9]$',
  })
  @IsString()
  @Matches(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'Start time must be in HH:mm format (24-hour)',
  })
  @IsNotEmpty()
  startTime: string;

  @ApiProperty({
    description: 'End time in HH:mm format (24-hour)',
    example: '17:00',
    pattern: '^([0-1][0-9]|2[0-3]):[0-5][0-9]$',
  })
  @IsString()
  @Matches(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'End time must be in HH:mm format (24-hour)',
  })
  @IsNotEmpty()
  endTime: string;
}

export class AddWorkingHoursDto {
  @ApiProperty({
    type: [WorkingHourDto],
    description: 'Array of working hours for different days and locations',
    minItems: 1,
  })
  @IsArray()
  @ArrayMinSize(1, { message: 'At least one working hour entry is required' })
  @ValidateNested({ each: true })
  @Type(() => WorkingHourDto)
  workingHours: WorkingHourDto[];

  @ApiProperty({
    description: 'Duration of each inspection/appointment in minutes',
    example: 30,
    minimum: 15,
    maximum: 240,
  })
  @IsNumber()
  @Min(15, { message: 'Inspection duration must be at least 15 minutes' })
  @Max(240, { message: 'Inspection duration cannot exceed 240 minutes' })
  @IsNotEmpty()
  inspectionDuration: number;

  @ApiPropertyOptional({
    description: 'Price per inspection/appointment',
    example: 50.0,
    minimum: 0,
  })
  @IsNumber()
  @Min(0, { message: 'Inspection price cannot be negative' })
  inspectionPrice?: number;
}

export class WorkingHoursResponseDto {
  @ApiProperty()
  message: string;

  @ApiProperty()
  doctorId: string;

  @ApiProperty()
  workingHours: WorkingHourDto[];

  @ApiProperty()
  slotsGenerated: number;

  @ApiProperty()
  inspectionDuration: number;
}
