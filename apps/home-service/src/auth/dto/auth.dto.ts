// auth.dto.ts
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
import { BadRequestException } from '@nestjs/common';
export class RequestOtpDto {
  @ApiProperty({
    example: '+963912345678',
    description: 'Phone number with country code',
  })
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

  @ApiProperty({
    enum: UserRole,
    example: UserRole.USER,
    description: 'User role',
  })

  // Optional fields for sign-up (required if phone doesn't exist)
  @ApiPropertyOptional({ example: 'John Doe' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  @Matches(/^[a-zA-Z0-9._-]+$/, {
    message: 'Username contains invalid characters',
  })
  @Transform(({ value }) => value?.trim())
  username?: string;

  @ApiPropertyOptional({ enum: Gender, example: Gender.MALE })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @ApiPropertyOptional({ enum: City, example: City.Damascus })
  @IsOptional()
  @IsEnum(City)
  city?: City;

  @ApiPropertyOptional({
    example: '1990-01-01',
    description: 'Date of birth (YYYY-MM-DD)',
  })
  @IsOptional()
  @IsDate()
  @Transform(({ value }) => {
    const d = new Date(value);
    if (isNaN(d.getTime())) {
      throw new BadRequestException('Invalid date');
    }
    return d;
  })
  DataofBirth?: Date;

  @ApiPropertyOptional({ example: 'https://example.com/image.jpg' })
  @IsOptional()
  @IsString()
  image?: string;
}

export class VerifyOtpDto {
  @ApiProperty({ example: '+963912345678' })
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

  @ApiProperty({ example: '123456', description: '6-digit OTP code' })
  @IsNotEmpty()
  @IsString()
  @Length(6, 6)
  code: string;
}
export class UserDataDto {
  @ApiProperty()
  username: string;

  @ApiProperty()
  phone: string;

  @ApiProperty({ enum: Gender })
  gender: Gender;

  @ApiProperty({ enum: City })
  city: City;

  @ApiProperty()
  dateOfBirth: string;

  @ApiPropertyOptional()
  image?: string;

  @ApiPropertyOptional()
  imageUrl?: string;
}
export class AuthResponseDto {
  @ApiProperty()
  success: boolean;

  @ApiProperty()
  message: string;

  @ApiProperty({ required: false })
  authAccountId?: string;

  @ApiProperty({ required: false })
  userId?: string;

  @ApiProperty({ required: false })
  isNewUser?: boolean;

  @ApiProperty({
    required: false,
    description: 'JWT token (only returned after OTP verification)',
  })
  token?: string;

  @ApiProperty({ required: false, type: UserDataDto })
  user?: UserDataDto;
}

export class ResendOtpDto {
  @ApiProperty({ example: '+963912345678' })
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
}
