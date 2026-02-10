// dto/check-doctor-by-phone.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, IsNotEmpty, Matches } from 'class-validator';

export class CheckDoctorByPhoneDto {
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
}
