import {
  IsEnum,
  IsNumber,
  IsPositive,
  IsOptional,
  IsString,
} from 'class-validator';
import {
  Machines,
  EntityRequestStatus,
} from '@app/common/database/schemas/common.enums';

// ============================================
// CREATE REQUEST DTO
// ============================================

export class CreateMedicalEquipmentRequestDto {
  @IsOptional()
  @IsEnum(Machines, { message: 'Invalid equipment type' })
  equipmentType?: Machines;

  @IsOptional()
  @IsNumber({}, { message: 'Quantity must be a number' })
  @IsPositive({ message: 'Quantity must be greater than 0' })
  quantity?: number;

  @IsOptional()
  @IsString({ message: 'Note must be a string' })
  note?: string;
}

// ============================================
// UPDATE STATUS DTO (For admin updates)
// ============================================

export class UpdateMedicalEquipmentStatusDto {
  @IsEnum(EntityRequestStatus, { message: 'Invalid status' })
  status: EntityRequestStatus;

  @IsOptional()
  @IsString({ message: 'Review notes must be a string' })
  reviewNotes?: string;
}

// ============================================
// RESPONSE DTOs
// ============================================

export class RequesterInfoDto {
  id: string;
  image?: string;
  fullName: string;
  publicSpecialization?: string;
  privateSpecialization?: string;
  gender?: string;
  phones: object[];
}

export class MedicalEquipmentRequestResponseDto {
  id: string;
  requesterType: string;
  requesterId: string;
  requesterInfo?: RequesterInfoDto;
  equipmentType: Machines;
  quantity: number;
  note?: string;
  status: EntityRequestStatus;
  assignedTo?: string;
  reviewNotes?: string;
  createdAt: Date;
  updatedAt: Date;
  statusChangedAt?: Date;
}

export class MedicalEquipmentRequestsPageResponseDto {
  requests: MedicalEquipmentRequestResponseDto[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export class MedicalEquipmentStatisticsDto {
  totalRequests: number;
  pendingRequests: number;
  underReviewRequests: number;
  contactedRequests: number;
  completedRequests: number;
  cancelledRequests: number;
  requestsByType: Record<string, number>;
}
