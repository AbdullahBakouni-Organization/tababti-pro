import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
  Matches,
} from 'class-validator';

export enum AdminUpdateField {
  USERNAME = 'username',
  PASSWORD = 'password',
  PHONE = 'phone',
}

const SYRIAN_PHONE_REGEX = /^(0|\+963)?9\d{8}$/;

export class RequestAdminUpdateOtpDto {
  @ApiProperty({
    enum: AdminUpdateField,
    example: AdminUpdateField.PHONE,
    description: 'Which admin field to update',
  })
  @IsEnum(AdminUpdateField, {
    message: 'field must be one of: username, password, phone',
  })
  field: AdminUpdateField;

  @ApiProperty({
    example: '+963991234567',
    description:
      'New value for the chosen field. For phone use Syrian format; for password min length 8.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  @ValidateIf(
    (o: RequestAdminUpdateOtpDto) => o.field === AdminUpdateField.PASSWORD,
  )
  @MinLength(8, { message: 'password must be at least 8 characters long' })
  @ValidateIf(
    (o: RequestAdminUpdateOtpDto) => o.field === AdminUpdateField.PHONE,
  )
  @Matches(SYRIAN_PHONE_REGEX, {
    message: 'newValue must be a valid Syrian phone number',
  })
  @Transform(
    ({ value, obj }: { value: string; obj: RequestAdminUpdateOtpDto }) => {
      if (obj.field !== AdminUpdateField.PHONE || typeof value !== 'string') {
        return value;
      }
      let phone = value.replace(/[\s-]/g, '');
      if (phone.startsWith('0')) {
        phone = '+963' + phone.substring(1);
      } else if (phone.startsWith('963')) {
        phone = '+' + phone;
      } else if (!phone.startsWith('+')) {
        phone = '+963' + phone;
      }
      return phone;
    },
  )
  newValue: string;
}
