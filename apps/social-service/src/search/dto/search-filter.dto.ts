import {
  IsOptional,
  IsString,
  IsEnum,
  IsNumber,
  IsArray,
  Min,
  IsInt,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  CenterSpecialization,
  City,
  HospitalCategory,
  HospitalStatus,
  GeneralSpecialty,
  ConditionEnum,
  UserRole,
  PrivateMedicineSpecialty,
} from '@app/common/database/schemas/common.enums';

function toStringArray(value: any): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === 'string')
    return value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  return [];
}

export class SearchFilterDto {
  @ApiPropertyOptional({ description: 'Universal search string' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEnum(GeneralSpecialty)
  generalSpecialty?: GeneralSpecialty;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @Transform(({ value }) => toStringArray(value))
  @IsArray()
  @IsEnum(PrivateMedicineSpecialty, { each: true })
  privateSpecializationNames?: PrivateMedicineSpecialty[] = [];

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  yearsOfExperience?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @Transform(({ value }) => toStringArray(value))
  @IsArray()
  @IsString({ each: true })
  hospitalNames?: string[] = [];

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
  @IsEnum(City)
  hospitalCity?: City;

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

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @Transform(({ value }) => toStringArray(value))
  @IsArray()
  @IsString({ each: true })
  insuranceCompanies?: string[] = [];

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsEnum(['asc', 'desc'] as any)
  order?: 'asc' | 'desc';

  @ApiPropertyOptional({ enum: ConditionEnum, default: ConditionEnum.ALL })
  @IsOptional()
  @IsEnum(ConditionEnum)
  condition?: ConditionEnum;

  @IsOptional()
  @IsString()
  centerName?: string;

  @IsOptional()
  @IsEnum(CenterSpecialization)
  centerSpecialization?: CenterSpecialization;

  @IsOptional()
  @IsEnum(City)
  centerCity?: City;
}
