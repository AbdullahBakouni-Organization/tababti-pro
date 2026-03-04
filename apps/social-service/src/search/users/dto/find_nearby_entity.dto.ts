import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import type { TravelMode } from '../types/nearby.types';

const TRAVEL_MODES = [
  'driving-car',
  'driving-hgv',
  'foot-walking',
  'cycling-regular',
] as const;

const ENTITY_TYPES = ['doctors', 'hospitals', 'centers', 'all'] as const;

const GENDER_VALUES = ['male', 'female'] as const;

export class GetNearbyDoctorsHospitalsDto {
  // ─── Location ──────────────────────────────────────────────────────────────
  /**
   * Latitude of the user.
   * Supplied automatically from the browser Geolocation API, or manually
   * picked on the map by the client — either way the frontend sends it here.
   */
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  customerLat: number;

  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  customerLng: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0.5)
  @Max(100)
  radiusKm: number;

  // ─── Pagination ────────────────────────────────────────────────────────────
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 10;

  // ─── Travel ────────────────────────────────────────────────────────────────
  @IsOptional()
  @IsEnum(TRAVEL_MODES)
  mode?: TravelMode = 'driving-car';

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  includeRoutes?: boolean = false;

  // ─── Entity type ───────────────────────────────────────────────────────────
  @IsOptional()
  @IsEnum(ENTITY_TYPES)
  entityType?: 'doctors' | 'hospitals' | 'centers' | 'all' = 'all';

  // ─── Shared ────────────────────────────────────────────────────────────────
  /**
   * Filter all entity types to a specific city.
   * Pass the MongoDB ObjectId of the city.
   */
  @IsOptional()
  @IsMongoId()
  cityId?: string;

  // ─── Doctor filters ────────────────────────────────────────────────────────
  /**
   * Free-text name search across firstName, middleName, lastName.
   * The backend will build a smart regex that handles Arabic and Latin scripts.
   */
  @IsOptional()
  @IsString()
  doctorName?: string;

  @IsOptional()
  @IsString()
  publicSpecialization?: string;

  @IsOptional()
  @Transform(({ value }) =>
    Array.isArray(value) ? value : typeof value === 'string' ? [value] : [],
  )
  @IsString({ each: true })
  privateSpecializations?: string[];

  /** Filter doctors by gender: 'male' | 'female' */
  @IsOptional()
  @IsEnum(GENDER_VALUES)
  gender?: string;

  /** Minimum consultation price (inspectionPrice) */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minPrice?: number;

  /** Maximum consultation price (inspectionPrice) */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxPrice?: number;

  /** Minimum rating (1–5) */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(5)
  minRating?: number;

  /** Maximum rating (1–5) */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(5)
  maxRating?: number;

  // ─── Hospital filters ──────────────────────────────────────────────────────
  @IsOptional()
  @IsString()
  hospitalName?: string;

  @IsOptional()
  @IsString()
  hospitalCategory?: string;

  @IsOptional()
  @IsString()
  hospitalStatus?: string;

  @IsOptional()
  @IsString()
  hospitalSpecialization?: string;

  // ─── Center filters ────────────────────────────────────────────────────────
  @IsOptional()
  @IsString()
  centerSpecialization?: string;

  @IsOptional()
  @IsString()
  centerName?: string;

  // ─── Department / operations / devices ────────────────────────────────────
  /**
   * Filter hospitals/centers that have at least one of the given department types.
   * Values must match the DepartmentType enum (e.g. 'ICU', 'EMERGENCY', …).
   */
  @IsOptional()
  @Transform(({ value }) =>
    Array.isArray(value) ? value : typeof value === 'string' ? [value] : [],
  )
  @IsString({ each: true })
  departments?: string[];

  /**
   * Filter hospitals/centers that offer at least one of the given surgery types.
   * Values must match the CommonSurgery enum.
   */
  @IsOptional()
  @Transform(({ value }) =>
    Array.isArray(value) ? value : typeof value === 'string' ? [value] : [],
  )
  @IsString({ each: true })
  operations?: string[];

  /**
   * Filter hospitals/centers that have at least one of the given machine/device types.
   * Values must match the Machines enum.
   */
  @IsOptional()
  @Transform(({ value }) =>
    Array.isArray(value) ? value : typeof value === 'string' ? [value] : [],
  )
  @IsString({ each: true })
  machines?: string[];
}
