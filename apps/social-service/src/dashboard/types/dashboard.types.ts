import { Field, Float, Int, ObjectType } from '@nestjs/graphql';

// ── Stats Cards ───────────────────────────────────────────────────────────────

@ObjectType()
export class DashboardStats {
  @Field(() => Int)
  totalAppointments: number;

  @Field(() => Int)
  completedAppointments: number;

  @Field(() => Int)
  incompleteAppointments: number;

  @Field(() => Float)
  estimatedRevenue: number;

  @Field(() => Float)
  revenueChangePercent: number; // vs previous period
}

// ── Recent Patients ───────────────────────────────────────────────────────────

@ObjectType()
export class RecentPatient {
  @Field()
  patientId: string;

  @Field()
  name: string;

  @Field({ nullable: true })
  image?: string;

  @Field()
  locationName: string; // عيادة / مشفى المجتهد / مركز

  @Field()
  status: string; // مكتمل / غير مكتمل

  @Field()
  bookingDate: Date;
}

// ── Calendar ──────────────────────────────────────────────────────────────────

@ObjectType()
export class CalendarDay {
  @Field()
  date: string; // YYYY-MM-DD

  @Field(() => Int)
  appointmentCount: number;

  @Field()
  hasAppointments: boolean;
}

@ObjectType()
export class CalendarMonth {
  @Field(() => Int)
  year: number;

  @Field(() => Int)
  month: number;

  @Field(() => [CalendarDay])
  days: CalendarDay[];
}

// ── Appointments Table ────────────────────────────────────────────────────────

@ObjectType()
export class AppointmentRow {
  @Field()
  bookingId: string;

  @Field()
  patientName: string;

  @Field({ nullable: true })
  patientImage?: string;

  @Field()
  gender: string;

  @Field()
  time: string; // "10:00 مساء"

  @Field()
  date: string; // "2026/2/22"

  @Field()
  locationName: string; // مشفى المجتهد / العيادة

  @Field()
  status: string;
}

@ObjectType()
export class AppointmentsTableResult {
  @Field(() => [AppointmentRow])
  appointments: AppointmentRow[];

  @Field(() => Int)
  total: number;

  @Field(() => Int)
  page: number;

  @Field(() => Int)
  totalPages: number;
}

// ── Revenue Chart ─────────────────────────────────────────────────────────────

@ObjectType()
export class RevenueDataPoint {
  @Field()
  label: string; // Day label e.g. "Mon", "15"

  @Field(() => Float)
  thisMonth: number;

  @Field(() => Float)
  lastMonth: number;
}

@ObjectType()
export class RevenueChart {
  @Field(() => [RevenueDataPoint])
  data: RevenueDataPoint[];

  @Field(() => Float)
  totalThisMonth: number;

  @Field(() => Float)
  totalLastMonth: number;
}

// ── Full Dashboard ────────────────────────────────────────────────────────────

@ObjectType()
export class DoctorDashboard {
  @Field()
  doctorId: string;

  @Field()
  doctorName: string;

  @Field({ nullable: true })
  doctorImage?: string;

  @Field(() => DashboardStats)
  stats: DashboardStats;

  @Field(() => [RecentPatient])
  recentPatients: RecentPatient[];

  @Field(() => CalendarMonth)
  calendar: CalendarMonth;

  @Field(() => AppointmentsTableResult)
  appointments: AppointmentsTableResult;

  @Field(() => RevenueChart)
  revenueChart: RevenueChart;
}
