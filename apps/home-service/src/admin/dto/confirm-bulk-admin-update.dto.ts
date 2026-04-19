import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';

export class ConfirmBulkAdminUpdateDto {
  @ApiProperty({ example: '123456', description: '6-digit numeric OTP' })
  @Matches(/^\d{6}$/, { message: 'otp must be exactly 6 digits' })
  otp: string;
}
