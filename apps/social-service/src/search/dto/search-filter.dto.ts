import {
  IsOptional,
  IsString,
  IsEnum,
  IsMongoId,
  IsArray,
  IsNumber,
  Min,
  Max,
  IsInt,
  IsIn,
  ValidateIf,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

import {
  ConditionEnum,
  Gender,
  Days,
  HospitalCategory,
  HospitalStatus,
  CenterSpecialization,
  City,
  ApprovalStatus,

} from '@app/common/database/schemas/common.enums';

const toStringArray = () =>
  Transform(({ value }) => {
    if (!value) return [];
    if (Array.isArray(value)) return value.filter(Boolean);
    if (typeof value === 'string')
      return value
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean);
    return [];
  });

export class SearchFilterDto {
  /* ========== GLOBAL SEARCH ========== */
  @ApiPropertyOptional({ example: 'أحمد' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: ConditionEnum, default: ConditionEnum.ALL })
  @IsOptional()
  @IsEnum(ConditionEnum)
  condition?: ConditionEnum;

  @ApiPropertyOptional({
    enum: City,
    example: 'Idlib',
    description: 'Enum key',
  })
  @IsOptional()
  @IsEnum(City)
  city?: City;

  @ApiPropertyOptional({ example: 'Ariha', description: 'Enum key' })
  @IsOptional()
  @IsString()
  subcity?: string;

  /* ========== DOCTOR FILTERS ========== */
  @ApiPropertyOptional({
    description: 'Public Specialty ID',
    example: '698f88ddba4763b672fe62be',
  })
  @IsOptional()
  @IsMongoId()
  publicSpecializationId?: string;

  @ApiPropertyOptional({
    description: 'Private Specialty IDs',
    example: ['698f88ddba4763b672fe62c5'],
  })
  @IsOptional()
  @IsMongoId({ each: true })
  @Transform(({ value }) => {
    if (!value) return undefined;
    if (Array.isArray(value)) return value.filter((v) => !!v);
    return [value];
  })
  privateSpecializationIds?: string[];

  @ApiPropertyOptional({ enum: Gender })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @ApiPropertyOptional({ enum: Days })
  @IsOptional()
  @IsEnum(Days)
  availableDay?: Days;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minExperience?: number;

  /* ========== PRICE / INSPECTION INFO ========== */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  inspectionPriceMin?: number;

  @IsOptional()
  @ValidateIf(o => o.inspectionPriceMin !== undefined)
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  inspectionPriceMax?: number;


  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  inspectionDuration?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  searchCount?: number;

  /* ========== LOCATION ========== */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  latitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  longitude?: number;

  /* ========== RATING ========== */
  @ApiPropertyOptional({
    example: 4,
    description: 'Minimum rating (0–5)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(5)
  minRating?: number;

  /* ========== INSURANCE / HOSPITAL FILTERS ========== */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  insuranceCompanies?: string[];

  @IsOptional()
  @IsString()
  hospitalName?: string;

  @IsOptional()
  @IsEnum(HospitalCategory)
  hospitalCategory?: HospitalCategory;

  @IsOptional()
  @IsEnum(HospitalStatus)
  hospitalStatus?: HospitalStatus;


  @IsOptional()
  @IsEnum(ApprovalStatus)
  approvalStatus?: ApprovalStatus;

  @IsOptional()
  @IsString()
  hospitalCity?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  hospitalMinBeds?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  hospitalMaxBeds?: number;

  /* ========== CENTER FILTERS ========== */
  @IsOptional()
  @IsString()
  centerCity?: string;

  @IsOptional()
  @IsEnum(CenterSpecialization)
  centerSpecialization?: CenterSpecialization;

  @IsOptional()
  @IsString()
  centerName?: string;

  topSearched?: number; 

  /* ========== PAGINATION ========== */
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number = 10;

  /* ========== SORTING ========== */
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: 'asc' | 'desc' = 'desc';
}
