import { IsEnum, IsOptional, IsString, IsArray } from 'class-validator';
import { EntityRequestStatus, LegalAdviceCategory } from '@app/common/database/schemas/common.enums';

// ============================================
// UPDATE STATUS DTO
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
    filterApplied?: Record<string, any>;
}

// ============================================
// STATISTICS DTO - PRODUCTION VERSION
// ============================================

export class LegalAdviceStatisticsDto {
    totalRequests: number;
    pendingRequests: number;
    underReviewRequests: number;
    contactedRequests: number;
    completedRequests: number;
    cancelledRequests: number;
    requestsByType: Record<string, number>;
}

// ============================================
// ADMIN DASHBOARD DTO
// ============================================

export class AdminDashboardDto {
    statistics: LegalAdviceStatisticsDto;
    pendingCount: number;
    summaryCards: {
        totalRequests: number;
        pendingRequests: number;
        inProgress: number;
        completed: number;
        successRate: string;
    };
}

// ============================================
// STATUS BREAKDOWN DTO
// ============================================

export class StatusBreakdownDto {
    pending: number;
    underReview: number;
    contacted: number;
    completed: number;
    cancelled: number;
}

// ============================================
// PERFORMANCE METRICS DTO
// ============================================

export class PerformanceMetricsDto {
    completionRate: string;
    pendingPercentage: string;
}

// ============================================
// FILTER DTO
// ============================================

export class LegalAdviceFilterDto {
    @IsOptional()
    requesterType?: string;

    @IsOptional()
    legalAdviceType?: LegalAdviceCategory;

    @IsOptional()
    status?: EntityRequestStatus;

    @IsOptional()
    page?: number = 1;

    @IsOptional()
    limit?: number = 10;
}