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
  @ApiPropertyOptional() bio?: string;
  @ApiPropertyOptional() address?: string;
  @ApiPropertyOptional({ type: [DoctorPhoneDto] }) phones?: DoctorPhoneDto[];
  @ApiPropertyOptional() rejectionReason?: string;
  @ApiPropertyOptional() approvedAt?: Date;
  @ApiPropertyOptional() rejectedAt?: Date;
  @ApiPropertyOptional() registeredAt?: Date;
  @ApiPropertyOptional() lastLoginAt?: Date;
  @ApiPropertyOptional() isSubscribed?: boolean;
  @ApiProperty() createdAt: Date;
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
