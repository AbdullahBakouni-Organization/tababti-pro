import {
  IsOptional,
  IsString,
  IsEnum,
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
  PrivateMedicineSpecialty,
  GeneralSpecialty,
  Machines,
  CommonSurgery,
  HospitalSpecialization,
} from '@app/common/database/schemas/common.enums';

/**
 * تحويل أي قيمة إلى مصفوفة نظيفة
 */
const toStringArray = () =>
  Transform(({ value }) => {
    if (!value) return [];
    if (Array.isArray(value)) return value.map((v) => v.trim()).filter(Boolean);
    if (typeof value === 'string')
      return value
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean);
    return [];
  });

export class SearchFilterDto {
  @ApiPropertyOptional({ example: 'أحمد' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: ConditionEnum, default: ConditionEnum.ALL })
  @IsOptional()
  @IsEnum(ConditionEnum)
  condition?: ConditionEnum;

  @ApiPropertyOptional({ enum: City })
  @IsOptional()
  @IsEnum(City)
  city?: City;

  @ApiPropertyOptional({ example: 'Ariha' })
  @IsOptional()
  @IsString()
  subcity?: string;

  // ======== DOCTOR FILTERS ========
  @ApiPropertyOptional({
    description: 'General specialty names',
    example: ['طب_بشري', 'طب_أسنان'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @toStringArray()
  generalSpecialtyNames?: GeneralSpecialty[];

  @ApiPropertyOptional({
    description: 'Private specialty names',
    example: ['عظمية', 'قلب'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @toStringArray()
  privateSpecializationNames?: PrivateMedicineSpecialty[];

  @ApiPropertyOptional({ enum: Gender })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @ApiPropertyOptional({ enum: Days })
  @IsOptional()
  @IsEnum(Days)
  availableDay?: Days;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minExperience?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  inspectionPriceMin?: number;

  @IsOptional()
  @ValidateIf((o) => o.inspectionPriceMin !== undefined)
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  inspectionPriceMax?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  inspectionDuration?: number;

  @ApiPropertyOptional({ example: 4, description: 'Minimum rating (0–5)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(5)
  minRating?: number;

  // Hospitals And Centers
  // Location

  @IsOptional()
  @IsString()
  hospitalCity?: string;

  @IsOptional()
  @IsString()
  centerCity?: string;

  // Name filter
  @IsOptional()
  @IsString()
  hospitalName?: string;

  @IsOptional()
  @IsString()
  centerName?: string;

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

  @IsOptional()
  @IsEnum(HospitalCategory)
  hospitalCategory?: HospitalCategory;
  @IsOptional()
  @IsEnum(CenterSpecialization)
  centerSpecialization?: CenterSpecialization;

  @IsOptional()
  @IsEnum(CenterSpecialization)
  hospitalSpecialization?: HospitalSpecialization;

  @IsOptional()
  @IsEnum(HospitalStatus)
  hospitalStatus?: HospitalStatus;

  @IsOptional()
  @IsEnum(ApprovalStatus)
  approvalStatus?: ApprovalStatus;

  @IsOptional()
  @IsString()
  address?: string;

  // ===== LOCATION =====
  @IsOptional()
  @IsNumber()
  latitude?: number;

  @IsOptional()
  @IsNumber()
  longitude?: number;

  @IsOptional()
  @IsNumber()
  radiusKm?: number;

  // ======== PAGINATION ========
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

  // ======== SORTING ========
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: 'asc' | 'desc' = 'desc';

  // ======== DEPARTMENTS ========
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Transform(({ value }) => {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    if (typeof value === 'string')
      return value
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean);
    return [];
  })
  departments?: string[];

  // ======== MACHINES ========
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Transform(({ value }) => {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    if (typeof value === 'string')
      return value
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean);
    return [];
  })
  machines?: Machines[];

  // ======== OPERATIONS ========
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Transform(({ value }) => {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    if (typeof value === 'string')
      return value
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean);
    return [];
  })
  operations?: CommonSurgery[];

  // ======== INCLUDE ENHANCER ========
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Transform(({ value }) => {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    if (typeof value === 'string')
      return value
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean);
    return [];
  })
  include?: string[];
}
