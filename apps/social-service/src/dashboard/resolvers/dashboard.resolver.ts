import { Resolver, Query, Args } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { Types } from 'mongoose';

import { DashboardService } from '../service/dashboard.service';
import {
  DoctorDashboard,
  DashboardStats,
  CalendarMonth,
  AppointmentsTableResult,
  GenderStats,
  LocationChart,
  RecentPatient,
} from '../types/dashboard.types';
import {
  DashboardArgs,
  CalendarArgs,
  LocationChartArgs,
  AppointmentsArgs,
  StatsArgs,
  GenderStatsArgs,
  resolveRefDate,
} from '../dto/dashboard.args';

import { GqlJwtAuthGuard } from '@app/common/guards/gql-jwt-auth.guard';
import { GqlRolesGuard } from '@app/common/guards/gql-roles.guard';
import { GqlCurrentUser } from '@app/common/decorator/gql-current-user.decorator';
import { Roles } from '@app/common/decorator/role.decorator';
import { UserRole } from '@app/common/database/schemas/common.enums';

@Resolver()
@UseGuards(GqlJwtAuthGuard, GqlRolesGuard)
@Roles(UserRole.DOCTOR)
export class DashboardResolver {
  constructor(private readonly dashboardService: DashboardService) {}

  // ═══════════════════════════════════════════════════════════════
  // FULL DASHBOARD — everything in one shot
  // selectedDate drives ALL sub-sections
  // ═══════════════════════════════════════════════════════════════

  @Query(() => DoctorDashboard, {
    name: 'doctorDashboard',
    description:
      'Full dashboard. selectedDate (YYYY-MM-DD) sets the reference month for all sections.',
  })
  async getDoctorDashboard(
    @GqlCurrentUser('accountId') accountId: string,
    @Args() args: DashboardArgs,
  ): Promise<DoctorDashboard> {
    return this.dashboardService.getDoctorDashboard(accountId, args);
  }

  // ═══════════════════════════════════════════════════════════════
  // STATS CARDS
  // ═══════════════════════════════════════════════════════════════

  @Query(() => DashboardStats, {
    name: 'dashboardStats',
    description: 'Stats cards. selectedDate sets the reference month.',
  })
  async getStats(
    @GqlCurrentUser('accountId') accountId: string,
    @Args() args: StatsArgs,
  ): Promise<DashboardStats> {
    const doctor = await this.dashboardService.resolveDoctor(accountId);
    const refDate = resolveRefDate(args.selectedDate);
    return this.dashboardService.getStats(
      doctor._id as Types.ObjectId,
      refDate,
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // RECENT PATIENTS — no date filter, always latest 10
  // ═══════════════════════════════════════════════════════════════

  @Query(() => [RecentPatient], {
    name: 'recentPatients',
    description: 'Last 10 patients regardless of month.',
  })
  async getRecentPatients(
    @GqlCurrentUser('accountId') accountId: string,
  ): Promise<RecentPatient[]> {
    const doctor = await this.dashboardService.resolveDoctor(accountId);
    return this.dashboardService.getRecentPatients(
      doctor._id as Types.ObjectId,
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // CALENDAR
  // ═══════════════════════════════════════════════════════════════

  @Query(() => CalendarMonth, {
    name: 'appointmentCalendar',
    description: 'Calendar heatmap. Pass year and month explicitly.',
  })
  async getCalendar(
    @GqlCurrentUser('accountId') accountId: string,
    @Args() args: CalendarArgs,
  ): Promise<CalendarMonth> {
    return this.dashboardService.getCalendar(accountId, args);
  }

  // ═══════════════════════════════════════════════════════════════
  // APPOINTMENTS TABLE
  // ═══════════════════════════════════════════════════════════════

  @Query(() => AppointmentsTableResult, {
    name: 'appointmentsTable',
    description: 'Paginated appointments. Filter by date, status, page, limit.',
  })
  async getAppointments(
    @GqlCurrentUser('accountId') accountId: string,
    @Args() args: AppointmentsArgs,
  ): Promise<AppointmentsTableResult> {
    return this.dashboardService.getAppointments(accountId, args);
  }

  // ═══════════════════════════════════════════════════════════════
  // GENDER STATS (DONUT)
  // ═══════════════════════════════════════════════════════════════

  @Query(() => GenderStats, {
    name: 'genderStats',
    description:
      'Male/female patient counts + completion % for the donut chart. selectedDate sets the reference month.',
  })
  async getGenderStats(
    @GqlCurrentUser('accountId') accountId: string,
    @Args() args: GenderStatsArgs,
  ): Promise<GenderStats> {
    const doctor = await this.dashboardService.resolveDoctor(accountId);
    const refDate = resolveRefDate(args.selectedDate);
    return this.dashboardService.getGenderStats(
      doctor._id as Types.ObjectId,
      refDate,
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // LOCATION CHART (WAVE)
  // ═══════════════════════════════════════════════════════════════

  @Query(() => LocationChart, {
    name: 'locationChart',
    description:
      'Appointment counts per day per location type. period: week|month. selectedDate sets the reference point.',
  })
  async getLocationChart(
    @GqlCurrentUser('accountId') accountId: string,
    @Args() args: LocationChartArgs,
  ): Promise<LocationChart> {
    return this.dashboardService.getLocationChart(accountId, args);
  }
}
