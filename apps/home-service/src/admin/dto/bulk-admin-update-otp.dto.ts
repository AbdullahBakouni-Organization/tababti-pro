import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const SYRIAN_PHONE_REGEX = /^(0|\+963)?9\d{8}$/;

export class BulkAdminUpdateOtpDto {
  @ApiProperty({
    required: false,
    example: 'admin-new',
    description: 'New username (omit to leave unchanged)',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  username?: string;

  @ApiProperty({
    required: false,
    example: 'StrongPass123',
    description: 'New password, min 8 chars (omit to leave unchanged)',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MinLength(8, { message: 'password must be at least 8 characters long' })
  @MaxLength(256)
  password?: string;

  @ApiProperty({
    required: false,
    example: '+963991234567',
    description:
      'New Syrian phone number (omit to leave unchanged). Accepts +9639..., 09..., 9639... and normalizes to +963...',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Matches(SYRIAN_PHONE_REGEX, {
    message: 'phone must be a valid Syrian phone number',
  })
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value;
    let phone = value.replace(/[\s-]/g, '');
    if (phone.startsWith('0')) phone = '+963' + phone.substring(1);
    else if (phone.startsWith('963')) phone = '+' + phone;
    else if (!phone.startsWith('+')) phone = '+963' + phone;
    return phone;
  })
  phone?: string;
}
