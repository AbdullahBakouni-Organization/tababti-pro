
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsMongoId, IsArray, IsString } from 'class-validator';

export enum EntityType {
  DOCTOR = 'doctor',
  HOSPITAL = 'hospital',
  CENTER = 'center',
}

export class GetEntityProfileDto {
  @IsMongoId()
  id: string;

  @IsEnum(EntityType)
  type: EntityType;
}

export class AddGalleryDto {
  @ApiProperty({
    type: 'string',
    format: 'binary',
    isArray: true,
    description: 'Upload multiple image files',
  })
  images: any;
}

export class RemoveGalleryDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  images: string[];
}
