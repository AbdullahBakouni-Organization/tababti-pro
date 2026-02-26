import { Resolver, Query, Args } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';

import { DashboardService } from '../service/dashboard.service';
import {
  DoctorDashboard,
  DashboardStats,
  CalendarMonth,
  AppointmentsTableResult,
  RevenueChart,
  RecentPatient,
} from '../types/dashboard.types';
import {
  DashboardArgs,
  CalendarArgs,
  RevenueChartArgs,
  AppointmentsArgs,
} from '../dto/dashboard.args';

// GraphQL-specific guards — no Passport, no crash
import { GqlJwtGuard } from '../../common/guards/gql-jwt.guard';
import { GqlRolesGuard } from '../../common/guards/gql-roles.guard';
import { Roles } from '@app/common/decorator/role.decorator';
import { UserRole } from '@app/common/database/schemas/common.enums';

@Resolver()
@UseGuards(GqlJwtGuard, GqlRolesGuard)
@Roles(UserRole.DOCTOR)
export class DashboardResolver {
  constructor(private readonly dashboardService: DashboardService) {}

  @Query(() => DoctorDashboard, {
    name: 'doctorDashboard',
    description: 'Full dashboard — all sections in one query',
  })
  async getDoctorDashboard(
    @Args() args: DashboardArgs,
  ): Promise<DoctorDashboard> {
    return this.dashboardService.getDoctorDashboard(args);
  }

  @Query(() => DashboardStats, {
    name: 'dashboardStats',
    description: 'Stats cards: totals + revenue',
  })
  async getStats(@Args() args: DashboardArgs): Promise<DashboardStats> {
    const doctor = await this.dashboardService.resolveDoctor(
      args.doctorAccountId,
    );
    return this.dashboardService.getStats(doctor._id);
  }

  @Query(() => [RecentPatient], {
    name: 'recentPatients',
    description: 'Last 10 patients in the sidebar',
  })
  async getRecentPatients(
    @Args() args: DashboardArgs,
  ): Promise<RecentPatient[]> {
    const doctor = await this.dashboardService.resolveDoctor(
      args.doctorAccountId,
    );
    return this.dashboardService.getRecentPatients(doctor._id);
  }

  @Query(() => CalendarMonth, {
    name: 'appointmentCalendar',
    description: 'Calendar heatmap — which days have appointments',
  })
  async getCalendar(@Args() args: CalendarArgs): Promise<CalendarMonth> {
    return this.dashboardService.getCalendar(args);
  }

  @Query(() => AppointmentsTableResult, {
    name: 'appointmentsTable',
    description: 'Paginated appointments table with optional filters',
  })
  async getAppointments(
    @Args() args: AppointmentsArgs,
  ): Promise<AppointmentsTableResult> {
    return this.dashboardService.getAppointments(args);
  }

  @Query(() => RevenueChart, {
    name: 'revenueChart',
    description: 'Revenue chart — this period vs last period',
  })
  async getRevenueChart(@Args() args: RevenueChartArgs): Promise<RevenueChart> {
    return this.dashboardService.getRevenueChart(args);
  }
}
