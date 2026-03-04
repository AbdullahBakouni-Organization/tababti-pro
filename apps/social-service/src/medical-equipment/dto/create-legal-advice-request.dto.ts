import { IsEnum, IsOptional, IsString } from 'class-validator';
import { LegalAdviceCategory, EntityRequestStatus } from '@app/common/database/schemas/common.enums';

// ============================================
// CREATE REQUEST DTO
// ============================================


export class CreateLegalAdviceRequestDto {
    @IsEnum(LegalAdviceCategory, { message: 'Invalid legal advice category' })
    legalAdviceType: LegalAdviceCategory;
}

// ============================================
// UPDATE STATUS DTO (For admin updates)
// ============================================

export class UpdateLegalAdviceStatusDto {
    @IsEnum(EntityRequestStatus, { message: 'Invalid status' })
    status: EntityRequestStatus;

    @IsOptional()
    @IsString({ message: 'Review notes must be a string' })
    reviewNotes?: string;

    @IsOptional()
    @IsString({ message: 'Contact notes must be a string' })
    contactNotes?: string;
}

// ============================================
// RESPONSE DTOs
// ============================================

export class LegalAdviceRequestResponseDto {
    id: string;
    requesterType: string;
    requesterId: string;
    legalAdviceType: LegalAdviceCategory;
    status: EntityRequestStatus;
    assignedTo?: string;
    reviewNotes?: string;
    contactNotes?: string;
    createdAt: Date;
    updatedAt: Date;
    statusChangedAt?: Date;
}

export class LegalAdviceRequestsPageResponseDto {
    requests: LegalAdviceRequestResponseDto[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

export class LegalAdviceStatisticsDto {
    totalRequests: number;
    pendingRequests: number;
    underReviewRequests: number;
    contactedRequests: number;
    completedRequests: number;
    cancelledRequests: number;
    requestsByType: Record<string, number>;
}