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
import { LegalAdviceService } from '../services/legal-advice.service';
import { JwtAuthGuard } from '@app/common/guards/jwt.guard';
import { RolesGuard } from '@app/common/guards/role.guard';
import { Roles } from '@app/common/decorator/role.decorator';
import { CurrentUser } from '@app/common/decorator/current-user.decorator';
import {
  UserRole,
  EntityRequestStatus,
  LegalAdviceCategory,
} from '@app/common/database/schemas/common.enums';
import { ApiResponse } from '../../common/response/api-response';
import {
  CreateLegalAdviceRequestDto,
  UpdateLegalAdviceStatusDto,
} from '../dto/create-legal-advice-request.dto';

@Controller('legal-advice-requests')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LegalAdviceController {
  constructor(private readonly legalAdviceService: LegalAdviceService) {}

  // ======== Create Legal Advice Request ========
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.DOCTOR, UserRole.HOSPITAL, UserRole.CENTER)
  async createRequest(
    @CurrentUser('role') requesterType: UserRole,
    @CurrentUser('accountId') requesterId: string,
    @Body() dto: CreateLegalAdviceRequestDto,
    @Headers('accept-language') lang: 'en' | 'ar' = 'en',
  ) {
    const request = await this.legalAdviceService.createRequest(
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
    @CurrentUser('accountId') requesterId: string,
    @Query('status') status?: EntityRequestStatus,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Headers('accept-language') lang: 'en' | 'ar' = 'en',
  ) {
    const result = await this.legalAdviceService.getMyRequests(
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
    @CurrentUser('accountId') requesterId: string,
    @Headers('accept-language') lang: 'en' | 'ar' = 'en',
  ) {
    const request = await this.legalAdviceService.getRequest(
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
    @Body() dto: UpdateLegalAdviceStatusDto,
    @Headers('accept-language') lang: 'en' | 'ar' = 'en',
  ) {
    const request = await this.legalAdviceService.updateRequestStatus(
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
    @CurrentUser('accountId') requesterId: string,
    @Headers('accept-language') lang: 'en' | 'ar' = 'en',
  ) {
    await this.legalAdviceService.deleteRequest(
      requestId,
      requesterType,
      requesterId,
    );

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
      messageKey: 'request.FETCHED',
      data: result,
    });
  }

  // ======== Get Statistics (Admin) ========
  @Get('admin/statistics')
  @Roles(UserRole.ADMIN)
  async getStatistics(@Headers('accept-language') lang: 'en' | 'ar' = 'en') {
    const stats = await this.legalAdviceService.getStatistics();

    return ApiResponse.success({
      lang,
      messageKey: 'request.STATISTICS',
      data: stats,
    });
  }
}
