// import { ObjectType, Field, Int, Float } from '@nestjs/graphql';

// // ── Stats Cards ───────────────────────────────────────────────────────────────

// @ObjectType()
// export class DashboardStats {
//   @Field(() => Int)
//   totalAppointments: number;

//   @Field(() => Int)
//   completedAppointments: number;

//   @Field(() => Int)
//   incompleteAppointments: number;

//   @Field(() => Float)
//   estimatedRevenue: number;

//   @Field(() => Int)
//   revenueChangePercent: number;
// }

// // ── Recent Patients ───────────────────────────────────────────────────────────

// @ObjectType()
// export class RecentPatient {
//   @Field()
//   patientId: string;

//   @Field()
//   name: string;

//   @Field({ nullable: true })
//   image?: string;

//   @Field()
//   locationName: string;

//   @Field()
//   status: string;

//   @Field()
//   bookingDate: Date;
// }

// // ── Calendar ──────────────────────────────────────────────────────────────────

// @ObjectType()
// export class CalendarDay {
//   @Field()
//   date: string;

//   @Field(() => Int)
//   appointmentCount: number;

//   @Field()
//   hasAppointments: boolean;
// }

// @ObjectType()
// export class CalendarMonth {
//   @Field(() => Int)
//   year: number;

//   @Field(() => Int)
//   month: number;

//   @Field(() => [CalendarDay])
//   days: CalendarDay[];
// }

// // ── Appointments Table ────────────────────────────────────────────────────────

// @ObjectType()
// export class AppointmentRow {
//   @Field()
//   bookingId: string;

//   @Field()
//   patientName: string;

//   @Field({ nullable: true })
//   patientImage?: string;

//   @Field()
//   gender: string;

//   @Field()
//   time: string;

//   @Field()
//   date: string;

//   @Field()
//   locationName: string;

//   @Field()
//   status: string;
// }

// @ObjectType()
// export class AppointmentsTableResult {
//   @Field(() => [AppointmentRow])
//   appointments: AppointmentRow[];

//   @Field(() => Int)
//   total: number;

//   @Field(() => Int)
//   page: number;

//   @Field(() => Int)
//   totalPages: number;
// }

// // ── Gender Donut Chart ────────────────────────────────────────────────────────

// @ObjectType()
// export class GenderStats {
//   @Field(() => Int)
//   maleCount: number;

//   @Field(() => Int)
//   femaleCount: number;

//   @Field(() => Int)
//   totalPatients: number;

//   @Field(() => Float)
//   malePercent: number;

//   @Field(() => Float)
//   femalePercent: number;

//   @Field(() => Float)
//   completionPercent: number;
// }

// // ── Location Chart ────────────────────────────────────────────────────────────
// // One data point per day — counts per location type
// // ✅ Simplified: no thisMonth/lastMonth comparison — just current period

// @ObjectType()
// export class LocationChartDataPoint {
//   @Field()
//   label: string; // "Sat" / "Sun" ... or "1".."31"

//   @Field()
//   date: string; // ✅ "2026-03-21" — actual ISO date for this point

//   @Field(() => Int)
//   clinic: number; // عيادة

//   @Field(() => Int)
//   hospital: number; // مشفى

//   @Field(() => Int)
//   center: number; // مركز
// }

// @ObjectType()
// export class LocationChart {
//   @Field(() => [LocationChartDataPoint])
//   data: LocationChartDataPoint[];

//   @Field(() => Int)
//   totalClinic: number;

//   @Field(() => Int)
//   totalHospital: number;

//   @Field(() => Int)
//   totalCenter: number;

//   // ✅ Handy totals for frontend tooltip/legend
//   @Field(() => Int)
//   totalAppointments: number;
// }

// // ── Full Dashboard ────────────────────────────────────────────────────────────

// @ObjectType()
// export class DoctorDashboard {
//   @Field()
//   doctorId: string;

//   @Field()
//   doctorName: string;

//   @Field({ nullable: true })
//   doctorImage?: string;

//   @Field(() => DashboardStats)
//   stats: DashboardStats;

//   @Field(() => [RecentPatient])
//   recentPatients: RecentPatient[];

//   @Field(() => CalendarMonth)
//   calendar: CalendarMonth;

//   @Field(() => AppointmentsTableResult)
//   appointments: AppointmentsTableResult;

//   @Field(() => GenderStats)
//   genderStats: GenderStats;

//   @Field(() => LocationChart)
//   locationChart: LocationChart;
// }
