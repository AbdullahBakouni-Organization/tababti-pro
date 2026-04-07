import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  MinLength,
  MaxLength,
  Matches,
  IsNumber,
  Min,
  Max,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { plainToInstance, Transform, Type } from 'class-transformer';
import {
  ApprovalStatus,
  City,
  Days,
  Gender,
  GeneralSpecialty,
  PrivateMedicineSpecialty,
  WorkigEntity,
} from '@app/common/database/schemas/common.enums';

const NAME_REGEX = /^[A-Za-z\u0600-\u06FF ]+$/;
const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/; // HH:mm

// ============================================
// Nested DTOs for working hours
// ============================================

export class WorkingHourLocationDto {
  @ApiProperty({ enum: WorkigEntity, example: WorkigEntity.CLINIC })
  @IsEnum(WorkigEntity)
  type: WorkigEntity;

  @ApiProperty({ example: 'Al-Shifa Clinic' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  entity_name: string;

  @ApiProperty({ example: '5 Mazzeh Street, Damascus' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  address: string;
}

export class WorkingHourDto {
  @ApiProperty({ enum: Days, example: Days.MONDAY })
  @IsEnum(Days)
  day: Days;

  @ApiProperty({ type: WorkingHourLocationDto })
  @ValidateNested()
  @Type(() => WorkingHourLocationDto)
  location: WorkingHourLocationDto;

  @ApiProperty({ example: '09:00', description: 'Start time in HH:mm format' })
  @IsString()
  @Matches(TIME_REGEX, {
    message: 'startTime must be in HH:mm format, e.g. 09:00',
  })
  startTime: string;

  @ApiProperty({ example: '17:00', description: 'End time in HH:mm format' })
  @IsString()
  @Matches(TIME_REGEX, {
    message: 'endTime must be in HH:mm format, e.g. 17:00',
  })
  endTime: string;
}

// ============================================
// Main DTO
// ============================================

export class AdminCreateDoctorDto {
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
  @IsString()
  @IsNotEmpty()
  @Matches(/^(0|\+963)?9\d{8}$/, {
    message: 'Phone number must be a valid Syrian phone number',
  })
  @Transform(({ value }: { value: string }) => {
    let phone = value.replace(/[\s-]/g, '');
    if (phone.startsWith('0')) {
      phone = '+963' + phone.substring(1);
    } else if (phone.startsWith('963')) {
      phone = '+' + phone;
    } else if (!phone.startsWith('+')) {
      phone = '+963' + phone;
    }
    return phone;
  })
  phone: string;

  // ==================== LOCATION ====================

  @ApiProperty({ enum: City, example: City.Damascus })
  @IsEnum(City, { message: 'Invalid city selection' })
  city: City;

  @ApiProperty({ example: 'دمشق القديمة' })
  @IsString()
  @IsNotEmpty()
  subcity: string;

  @ApiPropertyOptional({ example: 33.51 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @ApiPropertyOptional({ example: 36.29 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;

  // ==================== SPECIALIZATION ====================

  @ApiProperty({
    enum: GeneralSpecialty,
    example: GeneralSpecialty.HumanMedicine,
  })
  @IsEnum(GeneralSpecialty, { message: 'Invalid public specialization' })
  publicSpecialization: GeneralSpecialty;

  @ApiProperty({
    enum: PrivateMedicineSpecialty,
    example: PrivateMedicineSpecialty.GeneralPractitioner,
  })
  @IsEnum(PrivateMedicineSpecialty, {
    message: 'Invalid private specialization',
  })
  privateSpecialization: PrivateMedicineSpecialty;

  // ==================== DEMOGRAPHICS ====================

  @ApiProperty({ enum: Gender, example: Gender.MALE })
  @IsEnum(Gender, { message: 'Gender must be either male or female' })
  gender: Gender;

  // ==================== PROFESSIONAL INFO ====================

  @ApiPropertyOptional({ example: 'Experienced cardiologist with 10+ years.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  bio?: string;

  @ApiPropertyOptional({ example: '123 Mazzeh Street, Damascus' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  @Matches(/^[\p{L}\p{N}._-]+$/u, {
    message: 'Address contains invalid characters',
  })
  address?: string;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  yearsOfExperience?: number;

  @ApiPropertyOptional({
    example: 30,
    description: 'Inspection duration in minutes',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  inspectionDuration?: number;

  @ApiPropertyOptional({
    example: 5000,
    description: 'Inspection price in local currency',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  inspectionPrice?: number;

  // ==================== WORKING HOURS ====================

  @ApiPropertyOptional({
    type: [WorkingHourDto],
    description:
      'Doctor working schedule. Each entry defines a day, location, and time range.',
    example: [
      {
        day: 'monday',
        location: {
          type: 'clinic',
          entity_name: 'Al-Shifa Clinic',
          address: '5 Mazzeh St',
        },
        startTime: '09:00',
        endTime: '17:00',
      },
    ],
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    let parsed = value;
    if (typeof value === 'string') {
      try {
        parsed = JSON.parse(value);
      } catch {
        return value; // leave invalid JSON for @IsArray to reject
      }
    }
    // Convert each plain object to a WorkingHourDto instance so that
    // the whitelist validator recognises its decorated properties.
    if (Array.isArray(parsed)) {
      return plainToInstance(WorkingHourDto, parsed);
    }
    return parsed;
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkingHourDto)
  workingHours?: WorkingHourDto[];

  // ==================== STATS ====================

  @ApiPropertyOptional({
    example: 0,
    description: 'Initial profile view count',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  profileViews?: number;

  // ==================== STATUS ====================

  @ApiPropertyOptional({
    enum: ApprovalStatus,
    example: ApprovalStatus.APPROVED,
    description:
      'Doctor approval status. Defaults to APPROVED when created by admin.',
  })
  @IsOptional()
  @IsEnum(ApprovalStatus)
  status?: ApprovalStatus;
}
