import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsInt,
  Min,
  Max,
  IsEnum,
  IsDateString,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import {
  Gender,
  BookingStatus,
  WorkigEntity,
} from '@app/common/database/schemas/common.enums';

export enum SearchType {
  ALL = 'ALL',
  PATIENTS = 'PATIENTS',
  DOCTORS = 'DOCTORS',
  HOSPITALS = 'HOSPITALS',
  CENTERS = 'CENTERS',
}

export class SearchPatientsDto {
  @ApiPropertyOptional({
    description: 'Search by name or phone across all types',
  })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => {
    if (typeof value !== 'string') return value;
    return decodeURIComponent(value).trim();
  })
  search?: string;

  @ApiPropertyOptional({
    enum: SearchType,
    default: SearchType.ALL,
    description:
      'What to search: ALL | PATIENTS | DOCTORS | HOSPITALS | CENTERS',
  })
  @IsOptional()
  @IsEnum(SearchType)
  searchType?: SearchType = SearchType.ALL;

  @ApiPropertyOptional({ enum: Gender })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @ApiPropertyOptional({ enum: BookingStatus })
  @IsOptional()
  @IsEnum(BookingStatus)
  status?: BookingStatus;

  @ApiPropertyOptional({ description: 'Filter from date (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @ApiPropertyOptional({ description: 'Filter to date (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  toDate?: string;

  @ApiPropertyOptional({ description: 'Filter by location entity name' })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => {
    if (typeof value !== 'string') return value;
    return decodeURIComponent(value).trim();
  })
  locationName?: string;

  @ApiPropertyOptional({ enum: WorkigEntity })
  @IsOptional()
  @IsEnum(WorkigEntity)
  locationType?: WorkigEntity;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 10;
}
