import { City, Gender } from '@app/common/database/schemas/common.enums';
import { BadRequestException } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsString,
  IsEnum,
  IsOptional,
  IsDate,
  MinLength,
  MaxLength,
  Matches,
} from 'class-validator';
const NAME_REGEX = /^[A-Za-z\u0600-\u06FF ]+$/;
export class UpdateUserDto {
  @ApiPropertyOptional({
    description: 'Username',
    example: 'john_doe',
  })
  @IsString()
  @IsOptional()
  @MinLength(3)
  @MaxLength(50)
  @Matches(NAME_REGEX, {
    message: 'username must contain only Arabic or English letters',
  })
  username?: string;

  @ApiPropertyOptional({
    description: 'Gender',
    enum: Gender,
    example: 'Male',
  })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @ApiPropertyOptional({
    description: 'City',
    enum: City,
    example: 'New York',
  })
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
  @ApiPropertyOptional({
    type: 'string',
    format: 'binary',
    description: 'Profile image file (optional)',
  })
  @IsOptional()
  image?: any;
}

export class UpdateUserResponseDto {
  @ApiProperty({ example: 'User updated successfully' })
  message: string;

  @ApiProperty({
    description: 'Updated user data',
    example: {
      _id: '507f1f77bcf86cd799439011',
      username: 'john_doe',
      phone: '+1234567890',
      gender: 'Male',
      city: 'New York',
      DataofBirth: '1990-01-15',
      image: 'http://localhost:3000/uploads/profiles/image.jpg',
      isVerified: true,
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-02T00:00:00.000Z',
    },
  })
  user: {
    _id: string;
    authAccountId: string;
    username: string;
    phone: string;
    gender: string;
    image?: string;
    city: string;
    DataofBirth: string;
    isVerified: boolean;
    createdAt?: Date;
    updatedAt?: Date;
  };
}
