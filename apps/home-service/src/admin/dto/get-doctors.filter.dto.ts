// dto/get-doctors.filter.dto.ts
import { IsOptional, IsEnum, IsNumber, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ApprovalStatus,
  City,
  Gender,
} from '@app/common/database/schemas/common.enums';
import { SubCities } from '@app/common/database/schemas/sub-cities.schema';

export class GetDoctorsFilterDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number = 20;

  @ApiPropertyOptional({ enum: ApprovalStatus })
  @IsOptional()
  @IsEnum(ApprovalStatus)
  status?: ApprovalStatus;

  @ApiPropertyOptional({
    description: 'Search by first, middle or last name (Arabic/English)',
  })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({
    description: 'Filter by public specialization string',
  })
  @IsOptional()
  @IsString()
  publicSpecialization?: string;

  @ApiPropertyOptional({
    description: 'Filter by private specialization string',
  })
  @IsOptional()
  @IsString()
  privateSpecialization?: string;

  @ApiPropertyOptional({ enum: City })
  @IsOptional()
  @IsEnum(City)
  city?: City;

  @ApiPropertyOptional({ enum: SubCities })
  @IsOptional()
  @IsEnum(SubCities)
  subCity?: SubCities;

  @ApiPropertyOptional({ enum: Gender })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;
}
