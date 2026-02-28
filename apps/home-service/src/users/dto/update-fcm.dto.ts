import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsMongoId } from 'class-validator';

export class UpdateFCMTokenDto {
  @ApiProperty({
    description: 'Firebase Cloud Messaging token for push notifications',
    example: 'fS3kJ9lDkPqX2vYz_abc123456',
  })
  @IsString()
  @IsNotEmpty()
  fcmToken: string;
}

export class RemoveFCMTokenDto {
  @ApiProperty({
    description: 'User ID whose FCM token should be removed',
    example: '65f1c2e7a3d4b8c9e0123456',
  })
  @IsMongoId()
  userId: string;
}
