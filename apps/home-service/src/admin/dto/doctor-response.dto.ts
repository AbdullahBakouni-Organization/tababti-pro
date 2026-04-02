// dto/doctor-response.dto.ts
import {
  ApiExtraModels,
  ApiProperty,
  ApiPropertyOptional,
  getSchemaPath,
} from '@nestjs/swagger';

export class DoctorPhoneDto {
  @ApiPropertyOptional({ type: [String] }) whatsup?: string[];
  @ApiPropertyOptional({ type: [String] }) clinic?: string[];
  @ApiPropertyOptional({ type: [String] }) normal?: string[];
}

export class DoctorListItemDto {
  @ApiProperty() doctorId: string;
  @ApiProperty() firstName: string;
  @ApiProperty() middleName: string;
  @ApiProperty() lastName: string;
  @ApiProperty() fullName: string;
  @ApiProperty() gender: string;
  @ApiProperty() status: string;
  @ApiProperty() city: string;
  @ApiProperty() subcity: string;
  @ApiProperty() publicSpecialization: string;
  @ApiProperty() privateSpecialization: string;
  @ApiPropertyOptional() image?: string;
  @ApiPropertyOptional() rating?: number;
  @ApiPropertyOptional() yearsOfExperience?: number;
  @ApiPropertyOptional() inspectionPrice?: number;
  @ApiPropertyOptional() inspectionDuration?: number;
  @ApiPropertyOptional() profileCompletionPercentage?: number;
  @ApiPropertyOptional() bio?: string;
  @ApiPropertyOptional() address?: string;
  @ApiPropertyOptional({ type: [DoctorPhoneDto] }) phones?: DoctorPhoneDto[];
  @ApiPropertyOptional() rejectionReason?: string;
  @ApiPropertyOptional() approvedAt?: Date;
  @ApiPropertyOptional() rejectedAt?: Date;
  @ApiPropertyOptional() registeredAt?: Date;
  @ApiPropertyOptional() lastLoginAt?: Date;
  @ApiPropertyOptional() lat?: number;
  @ApiPropertyOptional() lng?: number;
  @ApiPropertyOptional() isSubscribed?: boolean;
  @ApiProperty() createdAt: Date;
}
export class PostItemDto {
  @ApiProperty() postId: string;
  @ApiProperty() content: string;
  @ApiProperty({ type: [String] }) images: string[];
  @ApiProperty() status: string;
  @ApiProperty() likesCount: number;
  @ApiPropertyOptional() approvedAt?: Date;
  @ApiPropertyOptional() rejectedAt?: Date;
  @ApiPropertyOptional() rejectionReason?: string;
  @ApiProperty() createdAt: Date;
}

export class DoctorDetailDto extends DoctorListItemDto {
  @ApiPropertyOptional() experienceStartDate?: Date;
  @ApiPropertyOptional({ type: [Object] }) workingHours?: any[];
  @ApiPropertyOptional({ type: [Object] }) hospitals?: any[];
  @ApiPropertyOptional({ type: [Object] }) centers?: any[];
  @ApiPropertyOptional({ type: [Object] }) insuranceCompanies?: any[];
  @ApiPropertyOptional({ type: [Object] }) gallery?: any[];
  @ApiPropertyOptional({ type: Object }) documents?: any;
  @ApiPropertyOptional() failedLoginAttempts?: number;
  @ApiPropertyOptional() lockedUntil?: Date;
  @ApiPropertyOptional() lastLoginIp?: string;
  @ApiPropertyOptional() twoFactorEnabled?: boolean;
  @ApiPropertyOptional() searchCount?: number;
  @ApiPropertyOptional() profileViews?: number;
  @ApiPropertyOptional() maxSessions?: number;
  @ApiPropertyOptional() workingHoursVersion?: number;
  @ApiProperty({ type: [PostItemDto] }) posts: PostItemDto[];
  @ApiProperty() postsCount: number;
}
@ApiExtraModels(DoctorListItemDto)
export class PaginatedDoctorsResponseDto {
  @ApiProperty({
    type: 'object',
    properties: {
      data: {
        type: 'array',
        items: { $ref: getSchemaPath(DoctorListItemDto) },
      },
    },
  })
  doctors: { data: DoctorListItemDto[] };

  @ApiProperty()
  meta: {
    currentPage: number;
    totalPages: number;
    totalItems: number;
    itemsPerPage: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}
