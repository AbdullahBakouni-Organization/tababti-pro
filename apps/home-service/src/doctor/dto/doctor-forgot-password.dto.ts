import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsString,
  IsNotEmpty,
  Matches,
  MinLength,
  MaxLength,
} from 'class-validator';

export class RequestDoctorPasswordResetDto {
  @ApiProperty({
    description: 'رقم الهاتف المسجل للطبيب',
    example: '+963991234567',
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
}

export class VerifyOtpForPasswordResetDto {
  @ApiProperty({
    description: 'رقم الهاتف',
    example: '+963991234567',
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
    description: 'رمز التحقق OTP',
    example: '123456',
  })
  @IsString()
  @IsNotEmpty({ message: 'رمز التحقق مطلوب' })
  @Matches(/^\d{6}$/, {
    message: 'رمز التحقق يجب أن يكون 6 أرقام',
  })
  otp: string;
}

export class ResetDoctorPasswordDto {
  @ApiProperty({
    description: 'رقم الهاتف',
    example: '+963991234567',
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
    description: 'رمز التحقق OTP',
    example: '123456',
  })
  @IsString()
  @IsNotEmpty({ message: 'رمز التحقق مطلوب' })
  otp: string;

  @ApiProperty({
    description: 'كلمة المرور الجديدة',
    example: 'NewPassword123!',
    minLength: 8,
  })
  @IsString()
  @IsNotEmpty({ message: 'كلمة المرور الجديدة مطلوبة' })
  @MinLength(8)
  @MaxLength(128)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, {
    message:
      'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
  })
  newPassword: string;
}
