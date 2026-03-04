import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class UpdateFCMTokenDto {
  @ApiProperty({
    description: 'Firebase Cloud Messaging token for push notifications',
    example: 'fS3kJ9lDkPqX2vYz_abc123456',
  })
  @IsString()
  @IsNotEmpty()
  fcmToken: string;
}
