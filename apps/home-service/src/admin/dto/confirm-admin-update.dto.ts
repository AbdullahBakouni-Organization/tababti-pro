import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, Matches } from 'class-validator';
import { AdminUpdateField } from './request-admin-update-otp.dto';

export class ConfirmAdminUpdateDto {
  @ApiProperty({
    enum: AdminUpdateField,
    example: AdminUpdateField.PHONE,
    description: 'Field being updated — must match the request-otp call',
  })
  @IsEnum(AdminUpdateField, {
    message: 'field must be one of: username, password, phone',
  })
  field: AdminUpdateField;

  @ApiProperty({ example: '123456', description: '6-digit numeric OTP' })
  @Matches(/^\d{6}$/, { message: 'otp must be exactly 6 digits' })
  otp: string;
}
