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
import { MedicalEquipmentService } from '../services/medical.equipment.service';
import { JwtAuthGuard } from '@app/common/guards/jwt.guard';
import { RolesGuard } from '@app/common/guards/role.guard';
import { Roles } from '@app/common/decorator/role.decorator';
import { CurrentUser } from '@app/common/decorator/current-user.decorator';
import { UserRole, EntityRequestStatus, Machines } from '@app/common/database/schemas/common.enums';
import { ApiResponse } from'@app/common/response/api-response';

@Controller('admin/medical-equipment-requests')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminMedicalEquipmentController {
    constructor(private readonly equipmentService: MedicalEquipmentService) { }

    // ==========================================
    // DASHBOARD & OVERVIEW
    // ==========================================

    /**
     * GET /admin/medical-equipment-requests/dashboard
     * Admin dashboard with statistics and overview
     */
    @Get('dashboard')
    async getDashboard(
        @Headers('accept-language') lang: 'en' | 'ar' = 'en',
    ) {
        const [statistics, pendingCount] = await Promise.all([
            this.equipmentService.getStatistics(),
            this.equipmentService.getPendingRequestsCount(),
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
     * GET /admin/medical-equipment-requests
     * View all medical equipment requests with filtering
     */
    @Get()
    async getAllRequests(
        @Query('requesterType') requesterType?: UserRole,
        @Query('equipmentType') equipmentType?: Machines,
        @Query('status') status?: EntityRequestStatus,
        @Query('page') page: number = 1,
        @Query('limit') limit: number = 10,
        @Headers('accept-language') lang: 'en' | 'ar' = 'en',
    ) {
        const result = await this.equipmentService.getAllRequests(
            { requesterType, equipmentType, status },
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
     * GET /admin/medical-equipment-requests/by-status/:status
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

        const result = await this.equipmentService.getAllRequests(
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
     * GET /admin/medical-equipment-requests/my-queue
     * View requests assigned to current admin
     */
    @Get('my-queue')
    async getMyQueue(
        @CurrentUser('userId') adminId: string,
        @Query('page') page: number = 1,
        @Query('limit') limit: number = 10,
        @Headers('accept-language') lang: 'en' | 'ar' = 'en',
    ) {
        const result = await this.equipmentService.getAllRequests(undefined, page, limit);

        return ApiResponse.success({
            lang,
            messageKey: 'admin.MY_QUEUE',
            data: result,
        });
    }

    /**
     * GET /admin/medical-equipment-requests/:id
     * View single request with full details
     */
    @Get(':id')
    async getRequest(
        @Param('id') requestId: string,
        @CurrentUser('role') userRole: UserRole,
        @CurrentUser('userId') userId: string,
        @Headers('accept-language') lang: 'en' | 'ar' = 'en',
    ) {
        const request = await this.equipmentService.getRequest(
            requestId,
            userRole,
            userId,
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
     * PATCH /admin/medical-equipment-requests/:id/status
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

        const request = await this.equipmentService.updateRequestStatus(
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
     * PATCH /admin/medical-equipment-requests/:id/mark-contacted
     * Mark request as contacted and add contact notes
     * 
     * Body:
     * {
     *   "contactNotes": "Called hospital, delivery scheduled"
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

        const request = await this.equipmentService.markAsContacted(
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
     * PATCH /admin/medical-equipment-requests/:id/move-to-review
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
        const request = await this.equipmentService.updateRequestStatus(
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
     * PATCH /admin/medical-equipment-requests/:id/complete
     * Mark request as completed
     * 
     * Body:
     * {
     *   "reviewNotes": "Equipment received and installed"
     * }
     */
    @Patch(':id/complete')
    async completeRequest(
        @Param('id') requestId: string,
        @Body() body: { reviewNotes?: string },
        @CurrentUser('userId') adminId: string,
        @Headers('accept-language') lang: 'en' | 'ar' = 'en',
    ) {
        const request = await this.equipmentService.updateRequestStatus(
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
     * PATCH /admin/medical-equipment-requests/:id/cancel
     * Cancel a request
     * 
     * Body:
     * {
     *   "reviewNotes": "Request cancelled per requester"
     * }
     */
    @Patch(':id/cancel')
    async cancelRequest(
        @Param('id') requestId: string,
        @Body() body: { reviewNotes?: string },
        @CurrentUser('userId') adminId: string,
        @Headers('accept-language') lang: 'en' | 'ar' = 'en',
    ) {
        const request = await this.equipmentService.updateRequestStatus(
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
     * PATCH /admin/medical-equipment-requests/bulk/status
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

        const result = await this.equipmentService.bulkUpdateStatus(
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
     * PATCH /admin/medical-equipment-requests/:id/assign
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

        const request = await this.equipmentService.reassignRequest(
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
     * GET /admin/medical-equipment-requests/statistics
     * Get detailed statistics and analytics
     */
    @Get('statistics')
    async getStatistics(
        @Headers('accept-language') lang: 'en' | 'ar' = 'en',
    ) {
        const stats = await this.equipmentService.getStatistics();

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