import {
  Controller,
  Get,
  Query,
  UseGuards,
  Param,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '@app/common/guards/jwt.guard';
import { RolesGuard } from '@app/common/guards/role.guard';
import { Roles } from '@app/common/decorator/role.decorator';
import { DashboardService } from '../service/dashboard.service.rest';
import { CurrentUser } from '@app/common/decorator/current-user.decorator';
import { UserRole } from '@app/common/database/schemas/common.enums';

import {
  DashboardQueryDto,
  CalendarQueryDto,
  LocationChartQueryDto,
  AppointmentsQueryDto,
  StatsQueryDto,
  GenderStatsQueryDto,
} from '../dto/dashboard-query.dto';

@ApiTags('Dashboard')
@Controller('dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.DOCTOR)
@ApiBearerAuth()
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  /**
   * GET /api/v1/dashboard
   * Full dashboard with all sections
   * Query params:
   *   - selectedDate: YYYY-MM-DD (optional, defaults to today)
   *   - period: week|month (optional, default: week)
   *   - page: number (optional, default: 1)
   *   - limit: number (optional, default: 10)
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get full doctor dashboard',
    description:
      'Returns complete dashboard with stats, appointments, calendar, and charts',
  })
  @ApiQuery({
    name: 'selectedDate',
    type: String,
    required: false,
    description: 'YYYY-MM-DD format',
  })
  @ApiQuery({
    name: 'period',
    enum: ['week', 'month'],
    required: false,
    description: 'Period for location chart',
  })
  @ApiQuery({ name: 'page', type: Number, required: false })
  @ApiQuery({ name: 'limit', type: Number, required: false })
  async getDoctorDashboard(
    @CurrentUser('accountId') accountId: string,
    @Query() query: DashboardQueryDto,
  ) {
    return this.dashboardService.getDoctorDashboard(accountId, query);
  }

  /**
   * GET /api/v1/dashboard/stats
   * Dashboard stats cards only
   * Query params:
   *   - selectedDate: YYYY-MM-DD (optional)
   */
  @Get('stats')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get dashboard statistics',
    description: 'Returns stats cards: appointments, revenue, completion %',
  })
  @ApiQuery({
    name: 'selectedDate',
    type: String,
    required: false,
    description: 'YYYY-MM-DD format, defaults to today',
  })
  async getStats(
    @CurrentUser('accountId') accountId: string,
    @Query() query: StatsQueryDto,
  ) {
    return this.dashboardService.getStats(accountId, query);
  }

  /**
   * GET /api/v1/dashboard/recent-patients
   * Last 10 patients regardless of month
   */
  @Get('recent-patients')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get recent patients',
    description: 'Returns last 10 patients with pending/confirmed bookings',
  })
  async getRecentPatients(@CurrentUser('accountId') accountId: string) {
    return this.dashboardService.getRecentPatients(accountId);
  }

  /**
   * GET /api/v1/dashboard/calendar
   * Calendar heatmap for a specific month
   * Query params:
   *   - year: number (required)
   *   - month: 1-12 (required)
   */
  @Get('calendar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get calendar heatmap',
    description: 'Returns appointment count heatmap for specified month',
  })
  @ApiQuery({ name: 'year', type: Number, required: true })
  @ApiQuery({ name: 'month', type: Number, required: true })
  async getCalendar(
    @CurrentUser('accountId') accountId: string,
    @Query() query: CalendarQueryDto,
  ) {
    return this.dashboardService.getCalendar(accountId, query);
  }

  /**
   * GET /api/v1/dashboard/appointments
   * Paginated appointments table
   * Query params:
   *   - date: YYYY-MM-DD (optional, filters by day)
   *   - monthDate: YYYY-MM-DD (optional, filters by month)
   *   - status: string (optional)
   *   - page: number (optional, default: 1)
   *   - limit: number (optional, default: 10)
   */
  @Get('appointments')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get paginated appointments table',
    description: 'Returns paginated list of appointments with filters',
  })
  @ApiQuery({ name: 'date', type: String, required: false })
  @ApiQuery({ name: 'monthDate', type: String, required: false })
  @ApiQuery({ name: 'status', type: String, required: false })
  @ApiQuery({ name: 'page', type: Number, required: false })
  @ApiQuery({ name: 'limit', type: Number, required: false })
  async getAppointments(
    @CurrentUser('accountId') accountId: string,
    @Query() query: AppointmentsQueryDto,
  ) {
    return this.dashboardService.getAppointments(accountId, query);
  }

  /**
   * GET /api/v1/dashboard/gender-stats
   * Gender breakdown donut chart
   * Query params:
   *   - selectedDate: YYYY-MM-DD (optional)
   */
  @Get('gender-stats')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get gender statistics',
    description: 'Returns male/female patient counts and completion %',
  })
  @ApiQuery({ name: 'selectedDate', type: String, required: false })
  async getGenderStats(
    @CurrentUser('accountId') accountId: string,
    @Query() query: GenderStatsQueryDto,
  ) {
    return this.dashboardService.getGenderStats(accountId, query);
  }

  /**
   * GET /api/v1/dashboard/location-chart
   * Location type breakdown chart
   * Query params:
   *   - period: week|month (optional, default: week)
   *   - selectedDate: YYYY-MM-DD (optional)
   */
  @Get('location-chart')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get location chart',
    description:
      'Returns appointment distribution by location type (clinic, hospital, center)',
  })
  @ApiQuery({
    name: 'period',
    enum: ['week', 'month'],
    required: false,
  })
  @ApiQuery({ name: 'selectedDate', type: String, required: false })
  async getLocationChart(
    @CurrentUser('accountId') accountId: string,
    @Query() query: LocationChartQueryDto,
  ) {
    return this.dashboardService.getLocationChart(accountId, query);
  }

  /**
   * GET /api/v1/dashboard/:doctorId (optional endpoint for admin/view others)
   */
  @Get(':doctorId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get specific doctor dashboard (admin only)',
  })
  async getDoctorDashboardById(
    @Param('doctorId') doctorId: string,
    @Query() query: DashboardQueryDto,
  ) {
    return this.dashboardService.getDoctorDashboardById(doctorId, query);
  }
}
