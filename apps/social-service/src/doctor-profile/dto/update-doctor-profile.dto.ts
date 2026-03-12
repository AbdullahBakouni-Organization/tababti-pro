// dto/update-doctor-profile.dto.ts
import { Type, Transform } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsArray,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
  Matches,
} from 'class-validator';
import {
  City,
  Days,
  Gender,
  GeneralSpecialty,
  PrivateMedicineSpecialty,
  WorkigEntity,
  DamascusAreas,
  RuralDamascusAreas,
  AleppoAreas,
  HomsAreas,
  HamaAreas,
  LatakiaAreas,
  TartousAreas,
  IdlibAreas,
  DaraaAreas,
  QuneitraAreas,
  SweidaAreas,
  HassakehAreas,
  RaqqaAreas,
  DeirEzzorAreas,
} from '@app/common/database/schemas/common.enums';

// ── Single source of truth: city → valid subcities ────────────────────────
export const CITY_SUBCITY_MAP: Record<City, string[]> = {
  [City.Damascus]: Object.values(DamascusAreas),
  [City.RifDimashq]: Object.values(RuralDamascusAreas),
  [City.Aleppo]: Object.values(AleppoAreas),
  [City.Homs]: Object.values(HomsAreas),
  [City.Hama]: Object.values(HamaAreas),
  [City.Latakia]: Object.values(LatakiaAreas),
  [City.Tartus]: Object.values(TartousAreas),
  [City.Idlib]: Object.values(IdlibAreas),
  [City.Daraa]: Object.values(DaraaAreas),
  [City.Quneitra]: Object.values(QuneitraAreas),
  [City.Suwayda]: Object.values(SweidaAreas),
  [City.AlHasakah]: Object.values(HassakehAreas),
  [City.Raqqa]: Object.values(RaqqaAreas),
  [City.DeirEzzor]: Object.values(DeirEzzorAreas),
};

export const MERGED_AREAS_ENUM = Object.assign(
  {},
  DamascusAreas,
  RuralDamascusAreas,
  AleppoAreas,
  HomsAreas,
  HamaAreas,
  LatakiaAreas,
  TartousAreas,
  IdlibAreas,
  DaraaAreas,
  QuneitraAreas,
  SweidaAreas,
  HassakehAreas,
  RaqqaAreas,
  DeirEzzorAreas,
);

// ── Helper: parse JSON string from form-data safely ───────────────────────
const parseJsonField = (val: unknown): unknown => {
  if (typeof val === 'string') {
    try {
      return JSON.parse(val);
    } catch {
      return val;
    }
  }
  return val;
};

// ── Nested DTOs ───────────────────────────────────────────────────────────
export class WorkingHourLocationDto {
  @IsEnum(WorkigEntity)
  type: WorkigEntity;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  entity_name: string;

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  address: string;
}

export class WorkingHourDto {
  @IsEnum(Days)
  day: Days;

  @ValidateNested()
  @Type(() => WorkingHourLocationDto)
  location: WorkingHourLocationDto;

  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'startTime must be HH:mm format e.g. "09:00"',
  })
  startTime: string;

  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'endTime must be HH:mm format e.g. "17:00"',
  })
  endTime: string;
}

export class PhonesDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  whatsup?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  clinic?: string[];
  // `normal` intentionally absent — read-only
}

// ── Main DTO ──────────────────────────────────────────────────────────────
export class UpdateDoctorProfileDto {
  // ── Personal info — allow update ──────────────────────────────────────
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  middleName?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  lastName?: string;

  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  bio?: string;

  // ── Specialization ────────────────────────────────────────────────────
  @IsOptional()
  @IsEnum(GeneralSpecialty)
  publicSpecialization?: GeneralSpecialty;

  @IsOptional()
  @IsEnum(PrivateMedicineSpecialty)
  privateSpecialization?: PrivateMedicineSpecialty;

  // ── Location ──────────────────────────────────────────────────────────
  @IsOptional()
  @IsEnum(City)
  city?: City;

  @IsOptional()
  @IsEnum(MERGED_AREAS_ENUM, {
    message: ({ value }) =>
      `subcity "${value}" is not a valid area in any Syrian city`,
  })
  subcity?: string;

  // ── Experience ────────────────────────────────────────────────────────
  @IsOptional()
  @Transform(({ value }) => (value ? new Date(value) : undefined))
  @IsDate()
  experienceStartDate?: Date;

  // ── Inspection — Transform converts form-data strings to numbers ──────
  @IsOptional()
  @Transform(({ value }) => (value !== undefined ? Number(value) : undefined))
  @IsNumber()
  @Min(0)
  inspectionPrice?: number;

  @IsOptional()
  @Transform(({ value }) => (value !== undefined ? Number(value) : undefined))
  @IsNumber()
  @Min(5)
  @Max(240)
  inspectionDuration?: number;

  // ── Working hours — Transform parses JSON string from form-data ───────
  @IsOptional()
  @Transform(({ value }) => parseJsonField(value))
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkingHourDto)
  workingHours?: WorkingHourDto[];

  // ── Phones — Transform parses JSON string from form-data ─────────────
  @IsOptional()
  @Transform(({ value }) => parseJsonField(value))
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PhonesDto)
  phones?: PhonesDto[];
}
