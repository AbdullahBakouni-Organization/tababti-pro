import {
  City,
  Gender,
  UserRole,
} from '@app/common/database/schemas/common.enums';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDate,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
const NAME_REGEX = /^[A-Za-z\u0600-\u06FF ]+$/;

// ─── Reusable phone normalizer ────────────────────────────────────────────────
function normalizePhone(value: string): string {
  if (!value || typeof value !== 'string') return value;
  let phone = value.replace(/[\s-]/g, '');
  if (phone.startsWith('0')) phone = '+963' + phone.substring(1);
  else if (phone.startsWith('963')) phone = '+' + phone;
  else if (!phone.startsWith('+')) phone = '+963' + phone;
  return phone;
}

const PHONE_REGEX = /^(0|\+963)?9\d{8}$/;
const PHONE_MESSAGE = 'Phone number must be a valid Syrian phone number';

// ─── RequestOtpDto ────────────────────────────────────────────────────────────
export class RequestOtpDto {
  @ApiProperty({
    example: '+963912345678',
    description: 'Syrian phone number (any common format accepted)',
  })
  @IsNotEmpty({ message: 'field.REQUIRED' })
  @IsString({ message: 'field.MUST_BE_STRING' })
  @Matches(PHONE_REGEX, { message: PHONE_MESSAGE })
  @Transform(({ value }) => normalizePhone(value))
  phone: string;

  @ApiPropertyOptional({ enum: UserRole, example: UserRole.USER })
  @IsOptional()
  @IsEnum(UserRole, { message: 'field.INVALID_VALUE' })
  role?: UserRole;

  @ApiPropertyOptional({ example: 'JohnDoe' })
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @Matches(NAME_REGEX, {
    message: 'username must contain only Arabic or English letters',
  })
  @IsString({ message: 'field.MUST_BE_STRING' })
  @MaxLength(50, { message: 'field.TOO_LONG' })
  username?: string;

  @ApiPropertyOptional({ enum: Gender, example: Gender.MALE })
  @IsOptional()
  @IsEnum(Gender, { message: 'field.INVALID_VALUE' })
  gender?: Gender;

  @ApiPropertyOptional({ enum: City, example: City.Damascus })
  @IsOptional()
  @IsEnum(City, { message: 'field.INVALID_VALUE' })
  city?: City;

  @ApiPropertyOptional({
    example: '1990-01-01',
    description: 'Date of birth — ISO-8601 (YYYY-MM-DD)',
  })
  @IsOptional()
  @IsDate({ message: 'field.INVALID_DATE' })
  @Transform(({ value }) => {
    // Not provided → skip (@IsOptional handles it)
    if (value === undefined || value === null || value === '') return undefined;
    const d = new Date(value);
    // Unparseable → null so @IsDate catches it — never throw here
    return isNaN(d.getTime()) ? null : d;
  })
  DataofBirth?: Date;

  @ApiPropertyOptional({ example: 'https://example.com/image.jpg' })
  @IsOptional()
  @IsString({ message: 'field.MUST_BE_STRING' })
  image?: string;

  @ApiPropertyOptional({
    enum: ['en', 'ar'],
    example: 'ar',
    description: 'Language for OTP WhatsApp message',
  })
  @IsOptional()
  @IsEnum(['en', 'ar'], { message: 'field.INVALID_VALUE' })
  lang?: 'en' | 'ar';
}

// ─── VerifyOtpDto ─────────────────────────────────────────────────────────────
export class VerifyOtpDto {
  @ApiProperty({ example: '+963912345678' })
  @IsNotEmpty({ message: 'field.REQUIRED' })
  @IsString({ message: 'field.MUST_BE_STRING' })
  @Matches(PHONE_REGEX, { message: PHONE_MESSAGE })
  @Transform(({ value }) => normalizePhone(value))
  phone: string;

  @ApiProperty({ example: '123456', description: '6-digit OTP code' })
  @IsNotEmpty({ message: 'field.REQUIRED' })
  @IsString({ message: 'field.MUST_BE_STRING' })
  @Length(6, 6, { message: 'field.OTP_LENGTH' })
  code: string;
}

// ─── ResendOtpDto ─────────────────────────────────────────────────────────────
export class ResendOtpDto {
  @ApiProperty({ example: '+963912345678' })
  @IsNotEmpty({ message: 'field.REQUIRED' })
  @IsString({ message: 'field.MUST_BE_STRING' })
  @Matches(PHONE_REGEX, { message: PHONE_MESSAGE })
  @Transform(({ value }) => normalizePhone(value))
  phone: string;
}

// ─── UserDataDto ──────────────────────────────────────────────────────────────
export class UserDataDto {
  @ApiProperty() username: string;
  @ApiProperty() phone: string;
  @ApiProperty({ enum: Gender }) gender: Gender;
  @ApiProperty({ enum: City }) city: City;
  @ApiProperty() dateOfBirth: string;
  @ApiPropertyOptional() image?: string;
  @ApiPropertyOptional() imageUrl?: string;
}

// ─── AuthResponseDto ──────────────────────────────────────────────────────────
export class AuthResponseDto {
  @ApiProperty() success: boolean;
  @ApiProperty() message: string;
  @ApiProperty({ required: false }) authAccountId?: string;
  @ApiProperty({ required: false }) userId?: string;
  @ApiProperty({ required: false }) isNewUser?: boolean;
  @ApiProperty({ required: false, description: 'JWT token' }) token?: string;
  @ApiProperty({ required: false, type: UserDataDto }) user?: UserDataDto;
}
