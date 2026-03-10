import {
    Controller,
    Get,
    Post,
    Patch,
    Delete,
    Body,
    Param,
    Query,
    Headers,
    UseGuards,
    HttpCode,
    HttpStatus,
} from '@nestjs/common';
import { MedicalEquipmentService } from '../services/medical.equipment.service';
import { JwtAuthGuard } from '@app/common/guards/jwt.guard';
import { RolesGuard } from '@app/common/guards/role.guard';
import { Roles } from '@app/common/decorator/role.decorator';
import { CurrentUser } from '@app/common/decorator/current-user.decorator';
import { UserRole, EntityRequestStatus, Machines } from '@app/common/database/schemas/common.enums';
import { ApiResponse } from '../../common/response/api-response';
import {
    CreateMedicalEquipmentRequestDto,
    UpdateMedicalEquipmentStatusDto,
} from '../dto/create-medical-equipment-request.dto';

@Controller('medical-equipment-requests')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MedicalEquipmentController {
    constructor(private readonly equipmentService: MedicalEquipmentService) { }

    // ======== Create Equipment Request ========
    @Post()
    @HttpCode(HttpStatus.CREATED)
    @Roles(UserRole.DOCTOR, UserRole.HOSPITAL, UserRole.CENTER)
    async createRequest(
        @CurrentUser('accountId') authAccountId: string,
        @CurrentUser('role') requesterType: UserRole,
        @CurrentUser('userId') requesterId: string,
        @Body() dto: CreateMedicalEquipmentRequestDto,
        @Headers('accept-language') lang: 'en' | 'ar' = 'en',
    ) {
        const request = await this.equipmentService.createRequest(
            authAccountId,
            requesterType,
            requesterId,
            dto,
        );

        return ApiResponse.success({
            lang,
            messageKey: 'request.CREATED',
            data: request,
        });
    }

    // ======== Get My Requests ========
    @Get('my-requests')
    @Roles(UserRole.DOCTOR, UserRole.HOSPITAL, UserRole.CENTER)
    async getMyRequests(
        @CurrentUser('role') requesterType: UserRole,
        @CurrentUser('userId') requesterId: string,
        @Query('status') status?: EntityRequestStatus,
        @Query('page') page: number = 1,
        @Query('limit') limit: number = 10,
        @Headers('accept-language') lang: 'en' | 'ar' = 'en',
    ) {
        const result = await this.equipmentService.getMyRequests(
            requesterType,
            requesterId,
            status,
            page,
            limit,
        );

        return ApiResponse.success({
            lang,
            messageKey: 'request.FETCHED',
            data: result,
        });
    }

    // ======== Get Single Request ========
    @Get(':id')
    @Roles(UserRole.DOCTOR, UserRole.HOSPITAL, UserRole.CENTER, UserRole.ADMIN)
    async getRequest(
        @Param('id') requestId: string,
        @CurrentUser('role') requesterType: UserRole,
        @CurrentUser('userId') requesterId: string,
        @Headers('accept-language') lang: 'en' | 'ar' = 'en',
    ) {
        const request = await this.equipmentService.getRequest(
            requestId,
            requesterType,
            requesterId,
        );

        return ApiResponse.success({
            lang,
            messageKey: 'request.FETCHED',
            data: request,
        });
    }

    // ======== Update Request Status (Admin Only) ========
    @Patch(':id/status')
    @Roles(UserRole.ADMIN)
    async updateRequestStatus(
        @Param('id') requestId: string,
        @Body() dto: UpdateMedicalEquipmentStatusDto,
        @Headers('accept-language') lang: 'en' | 'ar' = 'en',
    ) {
        const request = await this.equipmentService.updateRequestStatus(
            requestId,
            dto,
        );

        return ApiResponse.success({
            lang,
            messageKey: 'request.UPDATED',
            data: request,
        });
    }

    // ======== Delete Request ========
    @Delete(':id')
    @HttpCode(HttpStatus.NO_CONTENT)
    @Roles(UserRole.DOCTOR, UserRole.HOSPITAL, UserRole.CENTER)
    async deleteRequest(
        @Param('id') requestId: string,
        @CurrentUser('role') requesterType: UserRole,
        @CurrentUser('userId') requesterId: string,
        @Headers('accept-language') lang: 'en' | 'ar' = 'en',
    ) {
        await this.equipmentService.deleteRequest(requestId, requesterType, requesterId);

        return ApiResponse.success({
            lang,
            messageKey: 'request.DELETED',
            data: null,
        });
    }

    // ======== Get All Requests (Admin) ========
    @Get('admin/all')
    @Roles(UserRole.ADMIN)
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
            messageKey: 'request.FETCHED',
            data: result,
        });
    }

    // ======== Get Statistics (Admin) ========
    @Get('admin/statistics')
    @Roles(UserRole.ADMIN)
    async getStatistics(
        @Headers('accept-language') lang: 'en' | 'ar' = 'en',
    ) {
        const stats = await this.equipmentService.getStatistics();

        return ApiResponse.success({
            lang,
            messageKey: 'request.STATISTICS',
            data: stats,
        });
    }
}