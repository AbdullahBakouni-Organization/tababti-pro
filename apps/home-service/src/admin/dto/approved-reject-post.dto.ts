import { IsOptional, IsString, IsEnum, IsInt, Min, Max } from 'class-validator';
import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { PostStatus } from '@app/common/database/schemas/common.enums';

/**
 * DTO for getting posts with filters
 */
export class GetPostsFilterDto {
  @ApiPropertyOptional({
    description: 'Filter by post status',
    enum: PostStatus,
    example: PostStatus.PENDING,
  })
  @IsOptional()
  @IsEnum(PostStatus)
  status?: PostStatus;

  @ApiPropertyOptional({
    description:
      'Search by doctor name (Arabic or English) - supports partial match',
    example: 'أحمد',
  })
  @IsOptional()
  @IsString()
  doctorName?: string;

  @ApiPropertyOptional({
    description: 'Page number',
    example: 1,
    default: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Items per page',
    example: 20,
    default: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

/**
 * DTO for approving a post
 */
export class ApprovePostDto {
  @ApiPropertyOptional({
    description: 'Optional admin notes',
    example: 'Good quality content',
  })
  @IsOptional()
  @IsString()
  adminNotes?: string;
}

/**
 * DTO for rejecting a post
 */
export class RejectPostDto {
  @ApiProperty({
    description: 'Reason for rejection (required)',
    example: 'Content does not meet community guidelines',
  })
  @IsString()
  reason: string;

  @ApiPropertyOptional({
    description: 'Additional admin notes',
    example: 'Please review content policy before posting',
  })
  @IsOptional()
  @IsString()
  adminNotes?: string;
}

/**
 * Response DTO for post action
 */
export class PostActionResponseDto {
  @ApiProperty({ description: 'Success status' })
  success: boolean;

  @ApiProperty({ description: 'Action message' })
  message: string;

  @ApiProperty({ description: 'Post ID' })
  postId: string;

  @ApiProperty({ description: 'Doctor ID' })
  doctorId: string;

  @ApiProperty({ description: 'Doctor name' })
  doctorName: string;

  @ApiProperty({ description: 'New post status' })
  status: PostStatus;

  @ApiProperty({ description: 'Action timestamp' })
  actionAt: Date;

  @ApiProperty({ description: 'Admin ID who performed action' })
  adminId: string;

  @ApiPropertyOptional({ description: 'Rejection reason (if rejected)' })
  reason?: string;

  @ApiProperty({ description: 'Doctor notified via FCM' })
  doctorNotified: boolean;
}

/**
 * Post with doctor info
 */
export class PostWithDoctorDto {
  @ApiProperty({ description: 'Post ID' })
  postId: string;

  @ApiProperty({ description: 'Post content' })
  content: string;

  @ApiPropertyOptional({ description: 'Post title' })
  title?: string;

  @ApiProperty({ description: 'Post images URLs' })
  images: string[];

  @ApiProperty({ description: 'Post status' })
  status: PostStatus;

  @ApiProperty({ description: 'Doctor information' })
  doctor: {
    doctorId: string;
    fullName: string;
    image?: string;
  };

  @ApiProperty({ description: 'Created at' })
  createdAt: Date;

  @ApiPropertyOptional({ description: 'Rejection reason' })
  rejectionReason?: string;

  @ApiPropertyOptional({ description: 'Admin notes' })
  adminNotes?: string;
}

/**
 * Paginated posts response
 */
export class PaginatedPostsResponseDto {
  @ApiProperty({ type: [PostWithDoctorDto] })
  posts: PostWithDoctorDto[];

  @ApiProperty({
    description: 'Pagination metadata',
    example: {
      currentPage: 1,
      totalPages: 5,
      totalItems: 100,
      itemsPerPage: 20,
      hasNextPage: true,
      hasPreviousPage: false,
    },
  })
  meta: {
    currentPage: number;
    totalPages: number;
    totalItems: number;
    itemsPerPage: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };

  @ApiProperty({
    description: 'Summary statistics',
    example: {
      totalPending: 45,
      totalApproved: 120,
      totalRejected: 15,
    },
  })
  summary: {
    totalPending: number;
    totalApproved: number;
    totalRejected: number;
  };
}
