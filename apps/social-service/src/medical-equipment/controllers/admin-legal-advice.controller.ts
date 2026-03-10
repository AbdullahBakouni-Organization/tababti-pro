import {
    Controller,
    Get,
    Post,
    Patch,
    Body,
    Param,
    Query,
    Headers,
    UseGuards,
    HttpCode,
    HttpStatus,
    BadRequestException,
} from '@nestjs/common';
import { LegalAdviceService } from '../services/legal-advice.service';
import { JwtAuthGuard } from '@app/common/guards/jwt.guard';
import { RolesGuard } from '@app/common/guards/role.guard';
import { Roles } from '@app/common/decorator/role.decorator';
import { CurrentUser } from '@app/common/decorator/current-user.decorator';
import { UserRole, EntityRequestStatus, LegalAdviceCategory } from '@app/common/database/schemas/common.enums';
import { ApiResponse } from '../../common/response/api-response';

@Controller('admin/legal-advice-requests')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminLegalAdviceController {
    constructor(private readonly legalAdviceService: LegalAdviceService) { }

    // ==========================================
    // DASHBOARD & OVERVIEW
    // ==========================================

    /**
     * GET /admin/legal-advice-requests/dashboard
     * Admin dashboard with statistics and overview
     */
    @Get('dashboard')
    async getDashboard(
        @Headers('accept-language') lang: 'en' | 'ar' = 'en',
    ) {
        const [statistics, pendingCount] = await Promise.all([
            this.legalAdviceService.getStatistics(),
            this.legalAdviceService.getPendingRequestsCount(),
        ]);

        return ApiResponse.success({
            lang,
            messageKey: 'admin.DASHBOARD',
            data: {
                statistics,
                pendingCount,
                summaryCards: {
                    totalRequests: statistics.totalRequests,
                    pendingRequests: statistics.pendingRequests,
                    inProgress: statistics.underReviewRequests + statistics.contactedRequests,
                    completed: statistics.completedRequests,
                    successRate: `${Math.round((statistics.completedRequests / (statistics.totalRequests || 1)) * 100)}%`,
                },
            },
        });
    }

    // ==========================================
    // VIEW REQUESTS
    // ==========================================

    /**
     * GET /admin/legal-advice-requests
     * View all legal advice requests with filtering
     */
    @Get()
    async getAllRequests(
        @Query('requesterType') requesterType?: UserRole,
        @Query('legalAdviceType') legalAdviceType?: LegalAdviceCategory,
        @Query('status') status?: EntityRequestStatus,
        @Query('page') page: number = 1,
        @Query('limit') limit: number = 10,
        @Headers('accept-language') lang: 'en' | 'ar' = 'en',
    ) {
        const result = await this.legalAdviceService.getAllRequests(
            { requesterType, legalAdviceType, status },
            page,
            limit,
        );

        return ApiResponse.success({
            lang,
            messageKey: 'admin.REQUESTS_FETCHED',
            data: result,
        });
    }

    /**
     * GET /admin/legal-advice-requests/by-status/:status
     * View requests filtered by specific status
     */
    @Get('by-status/:status')
    async getRequestsByStatus(
        @Param('status') status: EntityRequestStatus,
        @Query('page') page: number = 1,
        @Query('limit') limit: number = 10,
        @Headers('accept-language') lang: 'en' | 'ar' = 'en',
    ) {
        // Validate status
        if (!Object.values(EntityRequestStatus).includes(status)) {
            throw new BadRequestException('request.INVALID_STATUS');
        }

        const result = await this.legalAdviceService.getAllRequests(
            { status },
            page,
            limit,
        );

        return ApiResponse.success({
            lang,
            messageKey: 'admin.REQUESTS_FETCHED',
            data: {
                ...result,
                filterApplied: { status },
            },
        });
    }

    /**
     * GET /admin/legal-advice-requests/my-queue
     * View requests assigned to current admin
     */
    @Get('my-queue')
    async getMyQueue(
        @CurrentUser('userId') adminId: string,
        @Query('page') page: number = 1,
        @Query('limit') limit: number = 10,
        @Headers('accept-language') lang: 'en' | 'ar' = 'en',
    ) {
        const result = await this.legalAdviceService.getAllRequests(undefined, page, limit);

        return ApiResponse.success({
            lang,
            messageKey: 'admin.MY_QUEUE',
            data: result,
        });
    }

    /**
     * GET /admin/legal-advice-requests/:id
     * View single request with full details
     */
    @Get(':id')
    async getRequest(
        @Param('id') requestId: string,
        @CurrentUser('role') userRole: UserRole,
        @CurrentUser('userId') userId: string,
        @Headers('accept-language') lang: 'en' | 'ar' = 'en',
    ) {
        const request = await this.legalAdviceService.getRequest(
            requestId,
            userRole,
            userId,
            true, // isAdmin
        );

        return ApiResponse.success({
            lang,
            messageKey: 'admin.REQUEST_DETAILS',
            data: request,
        });
    }

    // ==========================================
    // MANAGE REQUESTS - STATUS CHANGES
    // ==========================================

    /**
     * PATCH /admin/legal-advice-requests/:id/status
     * Update request status with validation
     * 
     * Body:
     * {
     *   "status": "UNDER_REVIEW" | "CONTACTED" | "COMPLETED" | "CANCELLED",
     *   "reviewNotes": "optional notes"
     * }
     */
    @Patch(':id/status')
    async updateStatus(
        @Param('id') requestId: string,
        @Body() body: { status: EntityRequestStatus; reviewNotes?: string },
        @CurrentUser('userId') adminId: string,
        @Headers('accept-language') lang: 'en' | 'ar' = 'en',
    ) {
        if (!body.status) {
            throw new BadRequestException('request.STATUS_REQUIRED');
        }

        const request = await this.legalAdviceService.updateRequestStatus(
            requestId,
            body,
            adminId,
        );

        return ApiResponse.success({
            lang,
            messageKey: 'admin.STATUS_UPDATED',
            data: request,
        });
    }

    /**
     * PATCH /admin/legal-advice-requests/:id/mark-contacted
     * Mark request as contacted and add contact notes
     * 
     * Body:
     * {
     *   "contactNotes": "Called doctor, need documents"
     * }
     */
    @Patch(':id/mark-contacted')
    async markAsContacted(
        @Param('id') requestId: string,
        @Body() body: { contactNotes: string },
        @CurrentUser('userId') adminId: string,
        @Headers('accept-language') lang: 'en' | 'ar' = 'en',
    ) {
        if (!body.contactNotes) {
            throw new BadRequestException('request.CONTACT_NOTES_REQUIRED');
        }

        const request = await this.legalAdviceService.markAsContacted(
            requestId,
            body.contactNotes,
            adminId,
        );

        return ApiResponse.success({
            lang,
            messageKey: 'admin.MARKED_CONTACTED',
            data: request,
        });
    }

    /**
     * PATCH /admin/legal-advice-requests/:id/move-to-review
     * Move request from PENDING to UNDER_REVIEW
     * 
     * Body:
     * {
     *   "reviewNotes": "optional review notes"
     * }
     */
    @Patch(':id/move-to-review')
    async moveToReview(
        @Param('id') requestId: string,
        @Body() body: { reviewNotes?: string },
        @CurrentUser('userId') adminId: string,
        @Headers('accept-language') lang: 'en' | 'ar' = 'en',
    ) {
        const request = await this.legalAdviceService.updateRequestStatus(
            requestId,
            {
                status: EntityRequestStatus.UNDER_REVIEW,
                reviewNotes: body.reviewNotes
            },
            adminId,
        );

        return ApiResponse.success({
            lang,
            messageKey: 'admin.MOVED_TO_REVIEW',
            data: request,
        });
    }

    /**
     * PATCH /admin/legal-advice-requests/:id/complete
     * Mark request as completed
     * 
     * Body:
     * {
     *   "reviewNotes": "Policy approved and activated"
     * }
     */
    @Patch(':id/complete')
    async completeRequest(
        @Param('id') requestId: string,
        @Body() body: { reviewNotes?: string },
        @CurrentUser('userId') adminId: string,
        @Headers('accept-language') lang: 'en' | 'ar' = 'en',
    ) {
        const request = await this.legalAdviceService.updateRequestStatus(
            requestId,
            {
                status: EntityRequestStatus.COMPLETED,
                reviewNotes: body.reviewNotes
            },
            adminId,
        );

        return ApiResponse.success({
            lang,
            messageKey: 'admin.REQUEST_COMPLETED',
            data: request,
        });
    }

    /**
     * PATCH /admin/legal-advice-requests/:id/cancel
     * Cancel a request
     * 
     * Body:
     * {
     *   "reviewNotes": "Doctor withdrew application"
     * }
     */
    @Patch(':id/cancel')
    async cancelRequest(
        @Param('id') requestId: string,
        @Body() body: { reviewNotes?: string },
        @CurrentUser('userId') adminId: string,
        @Headers('accept-language') lang: 'en' | 'ar' = 'en',
    ) {
        const request = await this.legalAdviceService.updateRequestStatus(
            requestId,
            {
                status: EntityRequestStatus.CANCELLED,
                reviewNotes: body.reviewNotes
            },
            adminId,
        );

        return ApiResponse.success({
            lang,
            messageKey: 'admin.REQUEST_CANCELLED',
            data: request,
        });
    }

    // ==========================================
    // BULK OPERATIONS
    // ==========================================

    /**
     * PATCH /admin/legal-advice-requests/bulk/status
     * Update multiple requests status at once
     * 
     * Body:
     * {
     *   "requestIds": ["id1", "id2", "id3"],
     *   "status": "UNDER_REVIEW"
     * }
     */
    @Patch('bulk/status')
    @HttpCode(HttpStatus.OK)
    async bulkUpdateStatus(
        @Body() body: { requestIds: string[]; status: EntityRequestStatus },
        @CurrentUser('userId') adminId: string,
        @Headers('accept-language') lang: 'en' | 'ar' = 'en',
    ) {
        if (!body.requestIds || body.requestIds.length === 0) {
            throw new BadRequestException('request.EMPTY_REQUEST_IDS');
        }

        if (!body.status) {
            throw new BadRequestException('request.STATUS_REQUIRED');
        }

        const result = await this.legalAdviceService.bulkUpdateStatus(
            body.requestIds,
            body.status,
            adminId,
        );

        return ApiResponse.success({
            lang,
            messageKey: 'admin.BULK_UPDATE_SUCCESS',
            data: result,
        });
    }

    // ==========================================
    // ASSIGNMENT
    // ==========================================

    /**
     * PATCH /admin/legal-advice-requests/:id/assign
     * Assign request to another admin
     * 
     * Body:
     * {
     *   "assignedToAdmin": "admin_id_123"
     * }
     */
    @Patch(':id/assign')
    async assignRequest(
        @Param('id') requestId: string,
        @Body() body: { assignedToAdmin: string },
        @CurrentUser('userId') adminId: string,
        @Headers('accept-language') lang: 'en' | 'ar' = 'en',
    ) {
        if (!body.assignedToAdmin) {
            throw new BadRequestException('request.ADMIN_ID_REQUIRED');
        }

        const request = await this.legalAdviceService.reassignRequest(
            requestId,
            body.assignedToAdmin,
            adminId,
        );

        return ApiResponse.success({
            lang,
            messageKey: 'admin.REQUEST_REASSIGNED',
            data: request,
        });
    }

    // ==========================================
    // ANALYTICS & REPORTS
    // ==========================================

    /**
     * GET /admin/legal-advice-requests/statistics
     * Get detailed statistics and analytics
     */
    @Get('statistics')
    async getStatistics(
        @Headers('accept-language') lang: 'en' | 'ar' = 'en',
    ) {
        const stats = await this.legalAdviceService.getStatistics();

        return ApiResponse.success({
            lang,
            messageKey: 'admin.STATISTICS',
            data: {
                ...stats,
                statusBreakdown: {
                    pending: stats.pendingRequests,
                    underReview: stats.underReviewRequests,
                    contacted: stats.contactedRequests,
                    completed: stats.completedRequests,
                    cancelled: stats.cancelledRequests,
                },
                performance: {
                    completionRate: `${Math.round((stats.completedRequests / (stats.totalRequests || 1)) * 100)}%`,
                    pendingPercentage: `${Math.round((stats.pendingRequests / (stats.totalRequests || 1)) * 100)}%`,
                },
            },
        });
    }
}