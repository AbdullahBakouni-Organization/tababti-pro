import { IsEnum, IsNumber, IsPositive, IsOptional, IsString } from 'class-validator';
import { Machines, EntityRequestStatus } from '@app/common/database/schemas/common.enums';

// ============================================
// CREATE REQUEST DTO
// ============================================


export class CreateMedicalEquipmentRequestDto {
    @IsEnum(Machines, { message: 'Invalid equipment type' })
    equipmentType: Machines;

    @IsNumber({}, { message: 'Quantity must be a number' })
    @IsPositive({ message: 'Quantity must be greater than 0' })
    quantity: number;
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

export class MedicalEquipmentRequestResponseDto {
    id: string;
    requesterType: string;
    requesterId: string;
    equipmentType: Machines;
    quantity: number;
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