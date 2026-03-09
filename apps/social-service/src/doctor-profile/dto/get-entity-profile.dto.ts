import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsMongoId, IsArray, IsString } from 'class-validator';

export enum EntityType {
  HOSPITAL = 'hospital',
  CENTER = 'center',
}

// ── Gallery — upload images (multipart/form-data) ─────────────────────────────
export class AddGalleryDto {
  @ApiPropertyOptional({
    type: 'array',
    items: { type: 'string', format: 'binary' },
    description: 'Image files to upload (multipart/form-data)',
  })
  images?: any;
}

// ── Gallery — remove specific images ─────────────────────────────────────────
export class RemoveGalleryDto {
  @ApiProperty({
    type: [String],
    description: 'Array of image paths to remove',
    example: ['uploads/doctors/gallery/1234567890-123456789.jpg'],
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  images: string[];
}

// ── Entity review — admin approve or reject entity profile ────────────────────
export class ReviewEntityDto {
  @ApiProperty({
    enum: ['approve', 'reject'],
    description: 'Action to perform on the entity',
  })
  @IsIn(['approve', 'reject'])
  action: 'approve' | 'reject';

  @ApiPropertyOptional({
    description: 'Reason for rejection (required when action is reject)',
    example: 'Missing required documents',
  })
  @IsOptional()
  @IsString()
  rejectionReason?: string;
}
