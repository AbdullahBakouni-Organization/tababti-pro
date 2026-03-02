// import {
//   Injectable,
//   NotFoundException,
//   BadRequestException,
// } from '@nestjs/common';
// import { InjectModel } from '@nestjs/mongoose';
// import { Model, Types } from 'mongoose';

// import { Booking } from '@app/common/database/schemas/booking.schema';
// import { Doctor } from '@app/common/database/schemas/doctor.schema';
// import { User } from '@app/common/database/schemas/user.schema';
// import {
//   BookingStatus,
//   WorkigEntity,
// } from '@app/common/database/schemas/common.enums';

// import {
//   DoctorDashboard,
//   DashboardStats,
//   RecentPatient,
//   CalendarMonth,
//   CalendarDay,
//   AppointmentsTableResult,
//   AppointmentRow,
//   GenderStats,
//   LocationChart,
//   LocationChartDataPoint,
// } from '../types/dashboard.types';

// import {
//   DashboardArgs,
//   CalendarArgs,
//   LocationChartArgs,
//   AppointmentsArgs,
//   StatsArgs,
//   GenderStatsArgs,
//   resolveRefDate,
// } from '../dto/dashboard.args';

// // ─── Location type mapping ────────────────────────────────────────────────────
// // Maps WorkigEntity enum values (whatever they are) to our three buckets.
// // $toLower is applied on DB side so comparison is always lowercase.
// // If your enum values change, only this map needs updating.
// const LOCATION_BUCKETS: Record<string, 'clinic' | 'hospital' | 'center'> = {
//   // WorkigEntity.CLINIC variants
//   [WorkigEntity.CLINIC?.toLowerCase?.() ?? 'clinic']: 'clinic',
//   clinic: 'clinic',
//   عيادة: 'clinic',

//   // WorkigEntity.HOSPITAL variants
//   [WorkigEntity.HOSPITAL?.toLowerCase?.() ?? 'hospital']: 'hospital',
//   hospital: 'hospital',
//   مشفى: 'hospital',
//   مستشفى: 'hospital',

//   // WorkigEntity.CENTER variants
//   [WorkigEntity.CENTER?.toLowerCase?.() ?? 'center']: 'center',
//   center: 'center',
//   مركز: 'center',
// };

// function toBucket(raw: string): 'clinic' | 'hospital' | 'center' | null {
//   return LOCATION_BUCKETS[(raw ?? '').toLowerCase().trim()] ?? null;
// }

// @Injectable()
// export class DashboardService {
//   constructor(
//     @InjectModel(Booking.name)
//     private readonly bookingModel: Model<Booking>,
//     @InjectModel(Doctor.name)
//     private readonly doctorModel: Model<Doctor>,
//     @InjectModel(User.name)
//     private readonly userModel: Model<User>,
//   ) {}

//   // ═══════════════════════════════════════════════════════════════
//   // FULL DASHBOARD
//   // ═══════════════════════════════════════════════════════════════

//   async getDoctorDashboard(
//     accountId: string,
//     args: DashboardArgs,
//   ): Promise<DoctorDashboard> {
//     const doctor = await this.resolveDoctor(accountId);
//     const doctorId = doctor._id as Types.ObjectId;
//     const refDate = resolveRefDate(args.selectedDate);

//     const [
//       stats,
//       recentPatients,
//       calendar,
//       appointments,
//       genderStats,
//       locationChart,
//     ] = await Promise.all([
//       this.getStats(doctorId, refDate),
//       this.getRecentPatients(doctorId),
//       this.getCalendar(accountId, {
//         year: refDate.getFullYear(),
//         month: refDate.getMonth() + 1,
//       }),
//       this.getAppointments(accountId, {
//         //date: args.selectedDate,
//         monthDate: args.selectedDate,
//         page: args.page ?? 1,
//         limit: args.limit ?? 10,
//       }),
//       this.getGenderStats(doctorId, refDate),
//       this._buildLocationChart(doctorId, args.period ?? 'week', refDate),
//     ]);

//     const fullName = [doctor.firstName, doctor.middleName, doctor.lastName]
//       .filter(Boolean)
//       .join(' ');

//     return {
//       doctorId: doctorId.toString(),
//       doctorName: fullName,
//       doctorImage: doctor.image ?? undefined,
//       stats,
//       recentPatients,
//       calendar,
//       appointments,
//       genderStats,
//       locationChart,
//     };
//   }

//   // ═══════════════════════════════════════════════════════════════
//   // STATS
//   // ═══════════════════════════════════════════════════════════════

//   async getStats(
//     doctorId: Types.ObjectId,
//     refDate: Date = new Date(),
//   ): Promise<DashboardStats> {
//     const y = refDate.getFullYear();
//     const m = refDate.getMonth();

//     const startOfMonth = new Date(y, m, 1, 0, 0, 0, 0);
//     const endOfMonth = new Date(y, m + 1, 0, 23, 59, 59, 999);
//     const startOfLastMonth = new Date(y, m - 1, 1, 0, 0, 0, 0);
//     const endOfLastMonth = new Date(y, m, 0, 23, 59, 59, 999);

//     const [currentAgg, lastAgg] = await Promise.all([
//       this.bookingModel.aggregate([
//         {
//           $match: {
//             doctorId,
//             bookingDate: { $gte: startOfMonth, $lte: endOfMonth },
//           },
//         },
//         {
//           $group: {
//             _id: '$status',
//             count: { $sum: 1 },
//             revenue: { $sum: '$price' },
//           },
//         },
//       ]),
//       this.bookingModel.aggregate([
//         {
//           $match: {
//             doctorId,
//             bookingDate: { $gte: startOfLastMonth, $lte: endOfLastMonth },
//             status: BookingStatus.COMPLETED,
//           },
//         },
//         { $group: { _id: null, total: { $sum: '$price' } } },
//       ]),
//     ]);

//     let total = 0,
//       completed = 0,
//       revenue = 0;
//     for (const row of currentAgg) {
//       total += row.count;
//       if (row._id === BookingStatus.COMPLETED) {
//         completed += row.count;
//         revenue += row.revenue;
//       }
//     }

//     const lastRevenue = lastAgg[0]?.total ?? 0;
//     const revenueChangePercent =
//       lastRevenue > 0
//         ? Math.round(((revenue - lastRevenue) / lastRevenue) * 100)
//         : 0;

//     return {
//       totalAppointments: total,
//       completedAppointments: completed,
//       incompleteAppointments: total - completed,
//       estimatedRevenue: revenue,
//       revenueChangePercent,
//     };
//   }

//   // ═══════════════════════════════════════════════════════════════
//   // RECENT PATIENTS
//   // ═══════════════════════════════════════════════════════════════

//   async getRecentPatients(doctorId: Types.ObjectId): Promise<RecentPatient[]> {
//     const bookings = await this.bookingModel.aggregate([
//       {
//         $match: {
//           doctorId,
//           status: {
//             $in: [
//               //BookingStatus.COMPLETED,
//               BookingStatus.PENDING,
//               //BookingStatus.CONFIRMED,
//             ],
//           },
//         },
//       },
//       { $sort: { bookingDate: -1 } },
//       { $limit: 10 },
//       {
//         $lookup: {
//           from: 'users',
//           localField: 'patientId',
//           foreignField: '_id',
//           as: 'patient',
//         },
//       },
//       { $unwind: { path: '$patient', preserveNullAndEmptyArrays: true } },
//       {
//         $project: {
//           patientId: 1,
//           status: 1,
//           bookingDate: 1,
//           locationName: '$location.entity_name',
//           patientName: '$patient.username',
//           patientImage: '$patient.image',
//         },
//       },
//     ]);

//     return bookings.map((b) => ({
//       patientId: b.patientId?.toString() ?? '',
//       name: b.patientName ?? 'Unknown',
//       image: b.patientImage ?? undefined,
//       locationName: b.locationName ?? '',
//       status: b.status,
//       bookingDate: b.bookingDate,
//     }));
//   }

//   // ═══════════════════════════════════════════════════════════════
//   // CALENDAR
//   // ═══════════════════════════════════════════════════════════════

//   async getCalendar(
//     accountId: string,
//     args: CalendarArgs,
//   ): Promise<CalendarMonth> {
//     const doctor = await this.resolveDoctor(accountId);
//     const doctorId = doctor._id as Types.ObjectId;

//     const start = new Date(args.year, args.month - 1, 1, 0, 0, 0, 0);
//     const end = new Date(args.year, args.month, 0, 23, 59, 59, 999);

//     const rows = await this.bookingModel.aggregate([
//       {
//         $match: {
//           doctorId,
//           bookingDate: { $gte: start, $lte: end },
//           status: {
//             $nin: [
//               BookingStatus.CANCELLED_BY_PATIENT,
//               BookingStatus.CANCELLED_BY_DOCTOR,
//             ],
//           },
//         },
//       },
//       {
//         $group: {
//           _id: { $dateToString: { format: '%Y-%m-%d', date: '$bookingDate' } },
//           count: { $sum: 1 },
//         },
//       },
//     ]);

//     const countMap = new Map<string, number>(
//       rows.map((r) => [r._id as string, r.count as number]),
//     );

//     const days: CalendarDay[] = [];
//     for (let d = 1; d <= end.getDate(); d++) {
//       const dateStr = `${args.year}-${String(args.month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
//       const count = countMap.get(dateStr) ?? 0;
//       days.push({
//         date: dateStr,
//         appointmentCount: count,
//         hasAppointments: count > 0,
//       });
//     }

//     return { year: args.year, month: args.month, days };
//   }

//   // ═══════════════════════════════════════════════════════════════
//   // APPOINTMENTS TABLE
//   // ═══════════════════════════════════════════════════════════════

//   async getAppointments(
//     accountId: string,
//     args: AppointmentsArgs,
//   ): Promise<AppointmentsTableResult> {
//     const doctor = await this.resolveDoctor(accountId);
//     const doctorId = doctor._id as Types.ObjectId;

//     const page = Math.max(args.page ?? 1, 1);
//     const limit = Math.min(args.limit ?? 10, 50);
//     const skip = (page - 1) * limit;

//     const match: Record<string, any> = { doctorId };

//     if (args.date) {
//       const day = new Date(args.date);
//       const nextDay = new Date(args.date);
//       nextDay.setDate(nextDay.getDate() + 1);
//       match.bookingDate = { $gte: day, $lt: nextDay };
//     }
//     if (args.monthDate) {
//       const d = new Date(args.monthDate);
//       const start = new Date(d.getFullYear(), d.getMonth(), 1);
//       const end = new Date(
//         d.getFullYear(),
//         d.getMonth() + 1,
//         0,
//         23,
//         59,
//         59,
//         999,
//       );
//       match.bookingDate = { $gte: start, $lte: end };
//     }
//     if (args.status) match.status = args.status;

//     const result = await this.bookingModel.aggregate([
//       { $match: match },
//       { $sort: { bookingDate: -1, bookingTime: 1 } },
//       {
//         $lookup: {
//           from: 'users',
//           localField: 'patientId',
//           foreignField: '_id',
//           as: 'patient',
//         },
//       },
//       { $unwind: { path: '$patient', preserveNullAndEmptyArrays: true } },
//       {
//         $facet: {
//           data: [
//             { $skip: skip },
//             { $limit: limit },
//             {
//               $project: {
//                 bookingId: '$_id',
//                 patientName: '$patient.username',
//                 patientImage: '$patient.image',
//                 gender: '$patient.gender',
//                 time: '$bookingTime',
//                 date: {
//                   $dateToString: { format: '%Y/%m/%d', date: '$bookingDate' },
//                 },
//                 locationName: '$location.entity_name',
//                 status: 1,
//               },
//             },
//           ],
//           totalCount: [{ $count: 'count' }],
//         },
//       },
//     ]);

//     const raw = result[0]?.data ?? [];
//     const total = result[0]?.totalCount?.[0]?.count ?? 0;

//     return {
//       appointments: raw.map((r: any) => ({
//         bookingId: r.bookingId?.toString() ?? '',
//         patientName: r.patientName ?? 'Unknown',
//         patientImage: r.patientImage ?? undefined,
//         gender: r.gender ?? '',
//         time: r.time ?? '',
//         date: r.date ?? '',
//         locationName: r.locationName ?? '',
//         status: r.status ?? '',
//       })),
//       total,
//       page,
//       totalPages: Math.ceil(total / limit),
//     };
//   }

//   // ═══════════════════════════════════════════════════════════════
//   // GENDER DONUT
//   // ═══════════════════════════════════════════════════════════════

//   async getGenderStats(
//     doctorId: Types.ObjectId,
//     refDate: Date = new Date(),
//   ): Promise<GenderStats> {
//     const y = refDate.getFullYear();
//     const m = refDate.getMonth();

//     const startOfMonth = new Date(y, m, 1, 0, 0, 0, 0);
//     const endOfMonth = new Date(y, m + 1, 0, 23, 59, 59, 999);

//     const rows = await this.bookingModel.aggregate([
//       {
//         $match: {
//           doctorId,
//           bookingDate: { $gte: startOfMonth, $lte: endOfMonth },
//           status: {
//             $nin: [
//               BookingStatus.CANCELLED_BY_PATIENT,
//               BookingStatus.CANCELLED_BY_DOCTOR,
//             ],
//           },
//         },
//       },
//       {
//         $lookup: {
//           from: 'users',
//           localField: 'patientId',
//           foreignField: '_id',
//           as: 'patient',
//         },
//       },
//       { $unwind: { path: '$patient', preserveNullAndEmptyArrays: true } },
//       {
//         $group: {
//           _id: { $toLower: { $ifNull: ['$patient.gender', 'unknown'] } },
//           count: { $sum: 1 },
//         },
//       },
//     ]);

//     let maleCount = 0,
//       femaleCount = 0;
//     for (const row of rows) {
//       const g = (row._id ?? '').toLowerCase();
//       if (g === 'male' || g === 'm') maleCount = row.count;
//       if (g === 'female' || g === 'f') femaleCount = row.count;
//     }

//     const totalPatients = maleCount + femaleCount;
//     const malePercent =
//       totalPatients > 0
//         ? Math.round((maleCount / totalPatients) * 1000) / 10
//         : 0;
//     const femalePercent =
//       totalPatients > 0
//         ? Math.round((femaleCount / totalPatients) * 1000) / 10
//         : 0;

//     const stats = await this.getStats(doctorId, refDate);
//     const completionPercent =
//       stats.totalAppointments > 0
//         ? Math.round(
//             (stats.completedAppointments / stats.totalAppointments) * 1000,
//           ) / 10
//         : 0;

//     return {
//       maleCount,
//       femaleCount,
//       totalPatients,
//       malePercent,
//       femalePercent,
//       completionPercent,
//     };
//   }

//   // ═══════════════════════════════════════════════════════════════
//   // LOCATION CHART (public — called from resolver standalone)
//   // ═══════════════════════════════════════════════════════════════

//   async getLocationChart(
//     accountId: string,
//     args: LocationChartArgs,
//   ): Promise<LocationChart> {
//     const doctor = await this.resolveDoctor(accountId);
//     const doctorId = doctor._id as Types.ObjectId;
//     const refDate = resolveRefDate(args.selectedDate);
//     return this._buildLocationChart(doctorId, args.period ?? 'week', refDate);
//   }

//   // ═══════════════════════════════════════════════════════════════
//   // RESOLVE DOCTOR (public — used by resolver for standalone queries)
//   // ═══════════════════════════════════════════════════════════════

//   public async resolveDoctor(authAccountId: string) {
//     if (!Types.ObjectId.isValid(authAccountId))
//       throw new BadRequestException('doctor.INVALID_ID');

//     const doctor = await this.doctorModel
//       .findOne({ authAccountId: new Types.ObjectId(authAccountId) })
//       .lean();

//     if (!doctor) throw new NotFoundException('doctor.NOT_FOUND');
//     return doctor;
//   }

//   // ═══════════════════════════════════════════════════════════════
//   // PRIVATE — build location chart
//   // ═══════════════════════════════════════════════════════════════

//   private async _buildLocationChart(
//     doctorId: Types.ObjectId,
//     period: 'week' | 'month',
//     refDate: Date,
//   ): Promise<LocationChart> {
//     const { start, end, labels } = this._periodBounds(period, refDate);

//     // ── Aggregate: group by day + location.type ───────────────────
//     const format = period === 'week' ? '%Y-%m-%d' : '%d';

//     const rows = await this.bookingModel.aggregate([
//       {
//         $match: {
//           doctorId,
//           bookingDate: { $gte: start, $lte: end },
//           status: {
//             $nin: [
//               BookingStatus.CANCELLED_BY_PATIENT,
//               BookingStatus.CANCELLED_BY_DOCTOR,
//             ],
//           },
//         },
//       },
//       {
//         $group: {
//           _id: {
//             day: { $dateToString: { format, date: '$bookingDate' } },
//             // ✅ Normalize to lowercase so CLINIC == clinic == Clinic
//             loc: { $toLower: { $ifNull: ['$location.type', ''] } },
//           },
//           count: { $sum: 1 },
//         },
//       },
//     ]);

//     // ── Build lookup map: "2026-03-21|clinic" → count ─────────────
//     const map = new Map<string, number>();
//     for (const r of rows) {
//       const bucket = toBucket(r._id.loc);
//       if (bucket) {
//         const key = `${r._id.day}|${bucket}`;
//         map.set(key, (map.get(key) ?? 0) + r.count);
//       }
//     }

//     // ── Build data points ─────────────────────────────────────────
//     let totalClinic = 0,
//       totalHospital = 0,
//       totalCenter = 0;

//     const data: LocationChartDataPoint[] = labels.map((label, i) => {
//       const d = new Date(start);
//       d.setDate(d.getDate() + i);

//       // dayKey format matches what MongoDB returned
//       const dayKey =
//         period === 'week'
//           ? d.toISOString().split('T')[0] // "2026-03-21"
//           : String(i + 1).padStart(2, '0'); // "01".."31"

//       const isoDate = d.toISOString().split('T')[0]; // always full ISO date

//       const clinic = map.get(`${dayKey}|clinic`) ?? 0;
//       const hospital = map.get(`${dayKey}|hospital`) ?? 0;
//       const center = map.get(`${dayKey}|center`) ?? 0;

//       totalClinic += clinic;
//       totalHospital += hospital;
//       totalCenter += center;

//       return { label, date: isoDate, clinic, hospital, center };
//     });

//     return {
//       data,
//       totalClinic,
//       totalHospital,
//       totalCenter,
//       totalAppointments: totalClinic + totalHospital + totalCenter,
//     };
//   }

//   // ── Period bounds helper ──────────────────────────────────────────────────

//   private _periodBounds(period: 'week' | 'month', refDate: Date) {
//     if (period === 'week') {
//       const end = new Date(refDate);
//       end.setHours(23, 59, 59, 999);
//       const start = new Date(refDate);
//       start.setDate(refDate.getDate() - 6);
//       start.setHours(0, 0, 0, 0);
//       const labels = Array.from({ length: 7 }, (_, i) => {
//         const d = new Date(start);
//         d.setDate(d.getDate() + i);
//         return d.toLocaleDateString('en', { weekday: 'short' }); // "Sat", "Sun"...
//       });
//       return { start, end, labels };
//     }

//     // month
//     const y = refDate.getFullYear(),
//       m = refDate.getMonth();
//     const start = new Date(y, m, 1, 0, 0, 0, 0);
//     const end = new Date(y, m + 1, 0, 23, 59, 59, 999);
//     const labels = Array.from({ length: end.getDate() }, (_, i) =>
//       String(i + 1),
//     );
//     return { start, end, labels };
//   }
// }
