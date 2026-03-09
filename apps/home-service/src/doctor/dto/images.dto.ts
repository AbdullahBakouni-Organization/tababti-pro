import { IsNotEmpty, IsMongoId, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO for uploading/updating doctor profile image
 */
export class UploadProfileImageDto {
  @ApiProperty({
    description: 'Doctor ID',
    example: '507f1f77bcf86cd799439011',
  })
  @IsNotEmpty()
  @IsMongoId()
  doctorId: string;
}

/**
 * DTO for adding images to doctor gallery
 */
export class AddGalleryImagesDto {
  @ApiProperty({
    description: 'Doctor ID',
    example: '507f1f77bcf86cd799439011',
  })
  @IsNotEmpty()
  @IsMongoId()
  doctorId: string;

  @ApiPropertyOptional({
    description: 'Optional description for the images',
    example: 'Clinic interior photos',
  })
  @IsOptional()
  @IsString()
  description?: string;
}

/**
 * Response DTO for profile image upload
 */
export class ProfileImageResponseDto {
  @ApiProperty({ description: 'Success status' })
  success: boolean;

  @ApiProperty({ description: 'Success message' })
  message: string;

  @ApiProperty({ description: 'Doctor ID' })
  doctorId: string;

  @ApiProperty({ description: 'Profile image URL' })
  imageUrl: string;

  @ApiProperty({ description: 'Previous image URL (if replaced)' })
  previousImageUrl?: string;
}

/**
 * Response DTO for gallery images upload
 */
export class GalleryImagesResponseDto {
  @ApiProperty({ description: 'Success status' })
  success: boolean;

  @ApiProperty({ description: 'Success message' })
  message: string;

  @ApiProperty({ description: 'Doctor ID' })
  doctorId: string;

  @ApiProperty({ description: 'Number of images uploaded' })
  uploadedCount: number;

  @ApiProperty({ description: 'Total gallery images count' })
  totalGalleryImages: number;

  @ApiProperty({
    description: 'Uploaded image URLs',
    example: [
      'http://localhost:9000/tababti-doctors/doctors/507f/gallery/uuid1.jpg',
      'http://localhost:9000/tababti-doctors/doctors/507f/gallery/uuid2.jpg',
    ],
  })
  uploadedImages: string[];
}

/**
 * Single gallery image info
 */
export interface GalleryImage {
  url: string;
  fileName: string;
  bucket: string;
  description?: string;
  uploadedAt: Date;
}
