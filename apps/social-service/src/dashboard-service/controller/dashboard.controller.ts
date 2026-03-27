import {
  Controller,
  Get,
  Query,
  UseGuards,
  Param,
  HttpCode,
  HttpStatus,
  Headers,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
  ApiOkResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '@app/common/guards/jwt.guard';
import { RolesGuard } from '@app/common/guards/role.guard';
import { Roles } from '@app/common/decorator/role.decorator';
import { DashboardService } from '../service/dashboard.service.rest';
import { CurrentUser } from '@app/common/decorator/current-user.decorator';
import { UserRole } from '@app/common/database/schemas/common.enums';
import { ApiResponse } from '../../common/response/api-response'; // ✅ same import as questions
import {
  DashboardQueryDto,
  CalendarQueryDto,
  LocationChartQueryDto,
  AppointmentsQueryDto,
  StatsQueryDto,
  GenderStatsQueryDto,
} from '../dto/dashboard-query.dto';
import { DoctorStatsResponseDto } from '../dto/doctor-community-stats.dto';

@ApiTags('Dashboard')
@Controller('dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.DOCTOR)
@ApiBearerAuth()
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  // ── Full dashboard ────────────────────────────────────────────────────────
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get full doctor dashboard' })
  @ApiQuery({ name: 'selectedDate', type: String, required: false })
  @ApiQuery({ name: 'period', enum: ['week', 'month'], required: false })
  @ApiQuery({ name: 'page', type: Number, required: false })
  @ApiQuery({ name: 'limit', type: Number, required: false })
  async getDoctorDashboard(
    @CurrentUser('accountId') accountId: string,
    @Query() query: DashboardQueryDto,
    @Headers('accept-language') lang: 'en' | 'ar' = 'en',
  ) {
    const data = await this.dashboardService.getDoctorDashboard(
      accountId,
      query,
    );
    return ApiResponse.success({ lang, messageKey: 'dashboard.FULL', data });
  }

  // ── Stats cards ───────────────────────────────────────────────────────────
  @Get('stats')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get dashboard statistics' })
  @ApiQuery({ name: 'selectedDate', type: String, required: false })
  async getStats(
    @CurrentUser('accountId') accountId: string,
    @Query() query: StatsQueryDto,
    @Headers('accept-language') lang: 'en' | 'ar' = 'en',
  ) {
    const data = await this.dashboardService.getStats(accountId, query);
    return ApiResponse.success({ lang, messageKey: 'dashboard.STATS', data });
  }

  // ── Recent patients ───────────────────────────────────────────────────────
  @Get('recent-patients')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get recent patients' })
  async getRecentPatients(
    @CurrentUser('accountId') accountId: string,
    @Headers('accept-language') lang: 'en' | 'ar' = 'en',
  ) {
    const data = await this.dashboardService.getRecentPatients(accountId);
    return ApiResponse.success({
      lang,
      messageKey: 'dashboard.PATIENTS',
      data,
    });
  }

  // ── Calendar heatmap ──────────────────────────────────────────────────────
  @Get('calendar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get calendar heatmap' })
  @ApiQuery({ name: 'year', type: Number, required: true })
  @ApiQuery({
    name: 'month',
    type: Number,
    required: true,
    description: '1–12',
  })
  async getCalendar(
    @CurrentUser('accountId') accountId: string,
    @Query() query: CalendarQueryDto,
    @Headers('accept-language') lang: 'en' | 'ar' = 'en',
  ) {
    const data = await this.dashboardService.getCalendar(accountId, query);
    return ApiResponse.success({
      lang,
      messageKey: 'dashboard.CALENDAR',
      data,
    });
  }

  // ── Appointments table ────────────────────────────────────────────────────
  @Get('appointments')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get paginated appointments table' })
  @ApiQuery({ name: 'date', type: String, required: false })
  @ApiQuery({ name: 'monthDate', type: String, required: false })
  @ApiQuery({ name: 'status', type: String, required: false })
  @ApiQuery({ name: 'page', type: Number, required: false })
  @ApiQuery({ name: 'limit', type: Number, required: false })
  async getAppointments(
    @CurrentUser('accountId') accountId: string,
    @Query() query: AppointmentsQueryDto,
    @Headers('accept-language') lang: 'en' | 'ar' = 'en',
  ) {
    const data = await this.dashboardService.getAppointments(accountId, query);
    return ApiResponse.success({
      lang,
      messageKey: 'dashboard.APPOINTMENTS',
      data,
    });
  }

  // ── Gender stats ──────────────────────────────────────────────────────────
  @Get('gender-stats')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get gender statistics' })
  @ApiQuery({ name: 'selectedDate', type: String, required: false })
  async getGenderStats(
    @CurrentUser('accountId') accountId: string,
    @Query() query: GenderStatsQueryDto,
    @Headers('accept-language') lang: 'en' | 'ar' = 'en',
  ) {
    const data = await this.dashboardService.getGenderStats(accountId, query);
    return ApiResponse.success({ lang, messageKey: 'dashboard.STATS', data });
  }

  // ── Location chart ────────────────────────────────────────────────────────
  @Get('location-chart')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get location chart' })
  @ApiQuery({ name: 'period', enum: ['week', 'month'], required: false })
  @ApiQuery({ name: 'selectedDate', type: String, required: false })
  async getLocationChart(
    @CurrentUser('accountId') accountId: string,
    @Query() query: LocationChartQueryDto,
    @Headers('accept-language') lang: 'en' | 'ar' = 'en',
  ) {
    const data = await this.dashboardService.getLocationChart(accountId, query);
    return ApiResponse.success({ lang, messageKey: 'dashboard.REVENUE', data });
  }

  // ── Cache status (debug) ──────────────────────────────────────────────────
  @Get('cache/status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cache status (debug)' })
  @ApiOkResponse({
    schema: {
      example: {
        recentPatients: { cachedAt: '2026-03-05T02:00:00.000Z' },
        locationChart: { cachedAt: '2026-03-05T00:00:00.000Z' },
      },
    },
  })
  async getCacheStatus(
    @CurrentUser('accountId') accountId: string,
    @Headers('accept-language') lang: 'en' | 'ar' = 'en',
  ) {
    const doctor = await this.dashboardService.resolveDoctor(accountId);
    const doctorId = doctor._id.toString();
    const data = this.dashboardService.getCacheInfo(doctorId);
    return ApiResponse.success({ lang, messageKey: 'dashboard.FULL', data });
  }

  // ── By doctorId (admin) — keep :doctorId LAST ─────────────────────────────
  @Get(':doctorId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get specific doctor dashboard (admin only)' })
  async getDoctorDashboardById(
    @Param('doctorId') doctorId: string,
    @Query() query: DashboardQueryDto,
    @Headers('accept-language') lang: 'en' | 'ar' = 'en',
  ) {
    const data = await this.dashboardService.getDoctorDashboardById(
      doctorId,
      query,
    );
    return ApiResponse.success({ lang, messageKey: 'dashboard.FULL', data });
  }
  // ── Force cron refresh (dev/debug only) ──────────────────────────────────────
  //
  @Roles(UserRole.ADMIN)
  @Get('cache/refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Manually trigger cron cache refresh (dev only)' })
  async forceCacheRefresh(
    @Headers('accept-language') lang: 'en' | 'ar' = 'en',
  ) {
    await Promise.all([
      this.dashboardService.cronRefreshRecentPatients(),
      this.dashboardService.cronRefreshLocationChart(),
    ]);

    return ApiResponse.success({
      lang,
      messageKey: 'dashboard.FULL',
      data: { message: 'Cache refreshed manually' },
    });
  }

  @Get('community-stats/:doctorId')
  async getDoctorStats(
    @Param('doctorId') doctorId: string,
  ): Promise<DoctorStatsResponseDto> {
    return this.dashboardService.getDoctorStats(doctorId);
  }
}
