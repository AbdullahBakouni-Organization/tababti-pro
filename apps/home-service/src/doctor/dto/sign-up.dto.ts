// ============================================
// DTOs - Data Transfer Objects
// ============================================

import {
  IsString,
  IsNotEmpty,
  IsEnum,
  MinLength,
  MaxLength,
  Matches,
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  AleppoAreas,
  ApprovalStatus,
  City,
  DamascusAreas,
  DaraaAreas,
  DeirEzzorAreas,
  Gender,
  GeneralSpecialty,
  HamaAreas,
  HassakehAreas,
  HomsAreas,
  IdlibAreas,
  LatakiaAreas,
  PrivateMedicineSpecialty,
  QuneitraAreas,
  RaqqaAreas,
  RuralDamascusAreas,
  SweidaAreas,
  TartousAreas,
} from '@app/common/database/schemas/common.enums';

const NAME_REGEX = /^[A-Za-z\u0600-\u06FF ]+$/;

// ============================================
// Registration DTO
// ============================================

export class DoctorRegistrationDto {
  // ==================== IDENTITY ====================

  @ApiProperty({ example: 'Ahmed' })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(50)
  @Matches(NAME_REGEX, {
    message: 'First name must contain only Arabic or English letters',
  })
  firstName: string;

  @ApiProperty({ example: 'Mohammed' })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(50)
  @Matches(NAME_REGEX, {
    message: 'Middle name must contain only Arabic or English letters',
  })
  middleName: string;

  @ApiProperty({ example: 'Al-Hassan' })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(50)
  @Matches(NAME_REGEX, {
    message: 'Last name must contain only Arabic or English letters',
  })
  lastName: string;

  @ApiProperty({ example: 'SecureP@ss123' })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(128)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, {
    message:
      'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
  })
  password: string;

  @ApiProperty({ example: '+963991234567' })
  @IsNotEmpty()
  @IsString()
  @Matches(/^(0|\+963)?9\d{8}$/, {
    message: 'Phone number must be a valid Syrian phone number',
  })
  @Transform(({ value }: { value: string }) => {
    // Remove all spaces and dashes
    let phone = value.replace(/[\s-]/g, '');

    // If starts with 0, replace with +963
    if (phone.startsWith('0')) {
      phone = '+963' + phone.substring(1);
    }
    // If starts with 963 without +, add +
    else if (phone.startsWith('963')) {
      phone = '+' + phone;
    }
    // If doesn't start with +, assume it's missing country code
    else if (!phone.startsWith('+')) {
      phone = '+963' + phone;
    }

    return phone;
  })
  phone: string;
  // ==================== LOCATION ====================
  @ApiProperty({ enum: City, example: City.Damascus })
  @IsEnum(City, { message: 'Invalid city selection' })
  city: City;

  @ApiProperty({ example: 'al_mazzeh' })
  @IsString()
  @IsNotEmpty()
  subcity:
    | DamascusAreas
    | AleppoAreas
    | LatakiaAreas
    | HassakehAreas
    | RuralDamascusAreas
    | HomsAreas
    | HamaAreas
    | TartousAreas
    | IdlibAreas
    | DaraaAreas
    | RaqqaAreas
    | DeirEzzorAreas
    | QuneitraAreas
    | SweidaAreas;

  // ==================== SPECIALIZATION ====================

  @ApiProperty({
    enum: GeneralSpecialty,
    example: GeneralSpecialty.HumanMedicine,
  })
  @IsEnum(GeneralSpecialty, { message: 'Invalid general specialization' })
  publicSpecialization: GeneralSpecialty;

  @ApiProperty({
    enum: PrivateMedicineSpecialty,
    example: PrivateMedicineSpecialty.AddictionTreatment,
  })
  @IsEnum(PrivateMedicineSpecialty, {
    message: 'Invalid private specialization',
  })
  privateSpecialization: PrivateMedicineSpecialty;

  // ==================== DEMOGRAPHICS ====================
  @ApiProperty({ enum: Gender, example: Gender.MALE })
  @IsEnum(Gender, { message: 'Gender must be either male or female' })
  gender: Gender;
}

// ============================================
// Custom Validation Decorator
// ============================================

// Mapping: Which private specializations belong to which public category
// Using enum VALUES as keys to match the validation logic
export const SpecialtyMapping: Record<string, string[]> = {
  [GeneralSpecialty.HumanMedicine]: [
    PrivateMedicineSpecialty.GeneralPractitioner,
    PrivateMedicineSpecialty.InternalMedicine,
    PrivateMedicineSpecialty.GeneralSurgery,
    PrivateMedicineSpecialty.Pediatrics,
    PrivateMedicineSpecialty.ObstetricsGynecology,
    PrivateMedicineSpecialty.Cardiology,
    PrivateMedicineSpecialty.Orthopedics,
    PrivateMedicineSpecialty.Neurology,
    PrivateMedicineSpecialty.Dermatology,
    PrivateMedicineSpecialty.Ophthalmology,
    PrivateMedicineSpecialty.Otolaryngology,
    PrivateMedicineSpecialty.Anesthesia,
    PrivateMedicineSpecialty.Radiology,
    PrivateMedicineSpecialty.Emergency,
    PrivateMedicineSpecialty.Oncology,
    PrivateMedicineSpecialty.Nephrology,
    PrivateMedicineSpecialty.Pulmonology,
    PrivateMedicineSpecialty.Gastroenterology,
    PrivateMedicineSpecialty.VascularSurgery,
    PrivateMedicineSpecialty.Endocrinology,
    PrivateMedicineSpecialty.Neurosurgery,
  ],
  [GeneralSpecialty.Dentistry]: [
    PrivateMedicineSpecialty.GeneralDentistry,
    PrivateMedicineSpecialty.Orthodontics,
    PrivateMedicineSpecialty.OralMaxillofacialSurgery,
    PrivateMedicineSpecialty.Endodontics,
    PrivateMedicineSpecialty.PediatricDentistry,
    PrivateMedicineSpecialty.FixedProsthodontics,
    PrivateMedicineSpecialty.RemovableProsthodontics,
    PrivateMedicineSpecialty.Implantology,
    PrivateMedicineSpecialty.Periodontics,
  ],
  [GeneralSpecialty.Psychiatry]: [
    PrivateMedicineSpecialty.GeneralPsychiatry,
    PrivateMedicineSpecialty.DepressionTreatment,
    PrivateMedicineSpecialty.AnxietyTreatment,
    PrivateMedicineSpecialty.AddictionTreatment,
    PrivateMedicineSpecialty.ChildPsychiatry,
  ],
  [GeneralSpecialty.Veterinary]: [
    PrivateMedicineSpecialty.GeneralVeterinary,
    PrivateMedicineSpecialty.Pets,
    PrivateMedicineSpecialty.Livestock,
    PrivateMedicineSpecialty.Poultry,
  ],
  [GeneralSpecialty.Physiotherapy]: [
    PrivateMedicineSpecialty.InjuryTreatment,
    PrivateMedicineSpecialty.Rehabilitation,
    PrivateMedicineSpecialty.SportsPhysiotherapy,
    PrivateMedicineSpecialty.NeurologicalPhysiotherapy,
    PrivateMedicineSpecialty.GeriatricPhysiotherapy,
  ],
};

// Subcities for each city
// Using enum VALUES as keys to match the validation logic
export const CityMapping: Record<string, string[]> = {
  [City.Damascus]: Object.values(DamascusAreas),
  [City.RifDimashq]: Object.values(RuralDamascusAreas),
  [City.Aleppo]: Object.values(AleppoAreas),
  [City.Homs]: Object.values(HomsAreas),
  [City.Hama]: Object.values(HamaAreas),
  [City.Latakia]: Object.values(LatakiaAreas),
  [City.Tartus]: Object.values(TartousAreas),
  [City.Idlib]: Object.values(IdlibAreas),
  [City.Raqqa]: Object.values(RaqqaAreas),
  [City.DeirEzzor]: Object.values(DeirEzzorAreas),
  [City.AlHasakah]: Object.values(HassakehAreas),
  [City.Daraa]: Object.values(DaraaAreas),
  [City.Suwayda]: Object.values(SweidaAreas),
  [City.Quneitra]: Object.values(QuneitraAreas),
};

/**
 * Validates that subcity belongs to the selected city
 */
export function IsValidSubcity(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isValidSubcity',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any, args: ValidationArguments) {
          const obj = args.object as DoctorRegistrationDto;
          const city = obj.city;

          if (!city || !value) {
            return false;
          }

          const validSubcities = CityMapping[city];
          return validSubcities && validSubcities.includes(value);
        },
        defaultMessage(args: ValidationArguments) {
          const obj = args.object as DoctorRegistrationDto;
          return `Subcity "${args.value}" is not valid for city "${obj.city}"`;
        },
      },
    });
  };
}

/**
 * Validates that private specialization belongs to the public category
 */
export function IsValidPrivateSpecialization(
  validationOptions?: ValidationOptions,
) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isValidPrivateSpecialization',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any, args: ValidationArguments) {
          const obj = args.object as DoctorRegistrationDto;
          const publicSpec = obj.publicSpecialization;

          if (!publicSpec || !value) {
            return false;
          }

          const validPrivateSpecs = SpecialtyMapping[publicSpec];
          return validPrivateSpecs && validPrivateSpecs.includes(value);
        },
        defaultMessage(args: ValidationArguments) {
          const obj = args.object as DoctorRegistrationDto;
          return `Private specialization "${args.value}" does not belong to public specialization "${obj.publicSpecialization}"`;
        },
      },
    });
  };
}

// ============================================
// Enhanced DTO with Custom Validators
// ============================================

export class DoctorRegistrationDtoValidated extends DoctorRegistrationDto {
  @IsValidSubcity()
  declare subcity:
    | DamascusAreas
    | AleppoAreas
    | LatakiaAreas
    | HassakehAreas
    | RuralDamascusAreas
    | HomsAreas
    | HamaAreas
    | TartousAreas
    | IdlibAreas
    | RaqqaAreas
    | DeirEzzorAreas
    | DaraaAreas
    | SweidaAreas
    | QuneitraAreas; // 'declare' tells TS we are just adding metadata/types

  @IsValidPrivateSpecialization()
  declare privateSpecialization: PrivateMedicineSpecialty;
}

// ============================================
// Response DTOs
// ============================================

export class RegistrationResponseDto {
  @ApiProperty()
  message: string;

  @ApiProperty()
  doctorId: string;

  @ApiProperty()
  status: ApprovalStatus;

  @ApiProperty()
  estimatedReviewTime: string;

  @ApiProperty()
  success: boolean;

  @ApiProperty({ required: false })
  uploadedFiles?: {
    certificateImage?: string;
    licenseImage?: string;
    certificateDocument?: string;
    licenseDocument?: string;
  };
}

export class ValidationErrorDto {
  @ApiProperty()
  field: string;

  @ApiProperty()
  message: string;

  @ApiProperty()
  value?: any;
}
