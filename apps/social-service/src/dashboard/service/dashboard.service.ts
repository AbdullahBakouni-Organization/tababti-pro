import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { Booking } from '@app/common/database/schemas/booking.schema';
import { Doctor } from '@app/common/database/schemas/doctor.schema';
import { User } from '@app/common/database/schemas/user.schema';
import { BookingStatus } from '@app/common/database/schemas/common.enums';

import {
  DoctorDashboard,
  DashboardStats,
  RecentPatient,
  CalendarMonth,
  CalendarDay,
  AppointmentsTableResult,
  AppointmentRow,
  RevenueChart,
  RevenueDataPoint,
} from '../types/dashboard.types';

import {
  DashboardArgs,
  CalendarArgs,
  RevenueChartArgs,
  AppointmentsArgs,
} from '../dto/dashboard.args';

@Injectable()
export class DashboardService {
  constructor(
    @InjectModel(Booking.name) private readonly bookingModel: Model<Booking>,
    @InjectModel(Doctor.name) private readonly doctorModel: Model<Doctor>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
  ) {}

  // ── Full Dashboard ────────────────────────────────────────────────────────

  async getDoctorDashboard(args: DashboardArgs): Promise<DoctorDashboard> {
    const doctor = await this.resolveDoctor(args.doctorAccountId);

    const selectedDate = args.selectedDate
      ? new Date(args.selectedDate)
      : new Date();

    const [stats, recentPatients, calendar, appointments, revenueChart] =
      await Promise.all([
        this.getStats(doctor._id as Types.ObjectId),
        this.getRecentPatients(doctor._id as Types.ObjectId),
        this.getCalendar({
          doctorAccountId: args.doctorAccountId,
          year: selectedDate.getFullYear(),
          month: selectedDate.getMonth() + 1,
        }),
        this.getAppointments({
          doctorAccountId: args.doctorAccountId,
          date: args.selectedDate,
          page: args.page ?? 1,
          limit: args.limit ?? 10,
        }),
        this.getRevenueChart({
          doctorAccountId: args.doctorAccountId,
          period: 'week',
        }),
      ]);

    const fullName = [doctor.firstName, doctor.middleName, doctor.lastName]
      .filter(Boolean)
      .join(' ');

    return {
      doctorId: (doctor._id as Types.ObjectId).toString(),
      doctorName: fullName,
      doctorImage: doctor.image ?? undefined,
      stats,
      recentPatients,
      calendar,
      appointments,
      revenueChart,
    };
  }

  // ── Stats Cards ───────────────────────────────────────────────────────────

  async getStats(doctorId: Types.ObjectId): Promise<DashboardStats> {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

    const [currentMonthAgg, lastMonthRevenue] = await Promise.all([
      this.bookingModel.aggregate([
        {
          $match: {
            doctorId,
            bookingDate: { $gte: startOfMonth, $lte: now },
          },
        },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            revenue: { $sum: '$price' },
          },
        },
      ]),

      this.bookingModel.aggregate([
        {
          $match: {
            doctorId,
            bookingDate: { $gte: startOfLastMonth, $lte: endOfLastMonth },
            status: BookingStatus.COMPLETED,
          },
        },
        { $group: { _id: null, total: { $sum: '$price' } } },
      ]),
    ]);

    let total = 0;
    let completed = 0;
    let revenue = 0;

    for (const row of currentMonthAgg) {
      total += row.count;
      if (row._id === BookingStatus.COMPLETED) {
        completed += row.count;
        revenue += row.revenue;
      }
    }

    const lastRevenue = lastMonthRevenue[0]?.total ?? 0;
    const revenueChangePercent =
      lastRevenue > 0
        ? Math.round(((revenue - lastRevenue) / lastRevenue) * 100)
        : 0;

    return {
      totalAppointments: total,
      completedAppointments: completed,
      incompleteAppointments: total - completed,
      estimatedRevenue: revenue,
      revenueChangePercent,
    };
  }

  // ── Recent Patients ───────────────────────────────────────────────────────

  async getRecentPatients(doctorId: Types.ObjectId): Promise<RecentPatient[]> {
    const bookings = await this.bookingModel.aggregate([
      {
        $match: {
          doctorId,
          status: {
            $in: [
              BookingStatus.COMPLETED,
              BookingStatus.PENDING,
              BookingStatus.CONFIRMED,
            ],
          },
        },
      },
      { $sort: { bookingDate: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: 'users',
          localField: 'patientId',
          foreignField: '_id',
          as: 'patient',
        },
      },
      { $unwind: { path: '$patient', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          patientId: 1,
          status: 1,
          bookingDate: 1,
          locationName: '$location.entity_name',
          patientName: '$patient.username',
          patientImage: '$patient.image',
        },
      },
    ]);

    return bookings.map((b) => ({
      patientId: b.patientId?.toString() ?? '',
      name: b.patientName ?? 'Unknown',
      image: b.patientImage ?? undefined,
      locationName: b.locationName ?? '',
      status: b.status,
      bookingDate: b.bookingDate,
    }));
  }

  // ── Calendar ──────────────────────────────────────────────────────────────

  async getCalendar(args: CalendarArgs): Promise<CalendarMonth> {
    const doctor = await this.resolveDoctor(args.doctorAccountId);
    const doctorId = doctor._id as Types.ObjectId;

    const start = new Date(args.year, args.month - 1, 1);
    const end = new Date(args.year, args.month, 0, 23, 59, 59);

    const bookings = await this.bookingModel.aggregate([
      {
        $match: {
          doctorId,
          bookingDate: { $gte: start, $lte: end },
          status: { $ne: BookingStatus.CANCELLED_BY_PATIENT },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$bookingDate' },
          },
          count: { $sum: 1 },
        },
      },
    ]);

    // Build a map of date → count
    const countMap = new Map<string, number>(
      bookings.map((b) => [b._id as string, b.count as number]),
    );

    // Build all days in the month
    const daysInMonth = end.getDate();
    const days: CalendarDay[] = [];

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${args.year}-${String(args.month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const count = countMap.get(dateStr) ?? 0;
      days.push({
        date: dateStr,
        appointmentCount: count,
        hasAppointments: count > 0,
      });
    }

    return { year: args.year, month: args.month, days };
  }

  // ── Appointments Table ────────────────────────────────────────────────────

  async getAppointments(
    args: AppointmentsArgs,
  ): Promise<AppointmentsTableResult> {
    const doctor = await this.resolveDoctor(args.doctorAccountId);
    const doctorId = doctor._id as Types.ObjectId;

    const page = Math.max(args.page ?? 1, 1);
    const limit = Math.min(args.limit ?? 10, 50);
    const skip = (page - 1) * limit;

    const match: Record<string, any> = { doctorId };

    if (args.date) {
      const day = new Date(args.date);
      const nextDay = new Date(day);
      nextDay.setDate(nextDay.getDate() + 1);
      match.bookingDate = { $gte: day, $lt: nextDay };
    }

    if (args.status) {
      match.status = args.status;
    }

    const pipeline: any[] = [
      { $match: match },
      { $sort: { bookingDate: -1, bookingTime: 1 } },
      {
        $lookup: {
          from: 'users',
          localField: 'patientId',
          foreignField: '_id',
          as: 'patient',
        },
      },
      { $unwind: { path: '$patient', preserveNullAndEmptyArrays: true } },
      {
        $facet: {
          data: [
            { $skip: skip },
            { $limit: limit },
            {
              $project: {
                bookingId: '$_id',
                patientName: '$patient.username',
                patientImage: '$patient.image',
                gender: '$patient.gender',
                time: '$bookingTime',
                date: {
                  $dateToString: { format: '%Y/%m/%d', date: '$bookingDate' },
                },
                locationName: '$location.entity_name',
                status: 1,
              },
            },
          ],
          totalCount: [{ $count: 'count' }],
        },
      },
    ];

    const result = await this.bookingModel.aggregate(pipeline);
    const raw = result[0]?.data ?? [];
    const total = result[0]?.totalCount?.[0]?.count ?? 0;

    const appointments: AppointmentRow[] = raw.map((r: any) => ({
      bookingId: r.bookingId?.toString() ?? '',
      patientName: r.patientName ?? 'Unknown',
      patientImage: r.patientImage ?? undefined,
      gender: r.gender ?? '',
      time: r.time ?? '',
      date: r.date ?? '',
      locationName: r.locationName ?? '',
      status: r.status ?? '',
    }));

    return {
      appointments,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  // ── Revenue Chart ─────────────────────────────────────────────────────────

  async getRevenueChart(args: RevenueChartArgs): Promise<RevenueChart> {
    const doctor = await this.resolveDoctor(args.doctorAccountId);
    const doctorId = doctor._id as Types.ObjectId;
    const period = args.period ?? 'week';

    const now = new Date();
    const { thisStart, thisEnd, lastStart, lastEnd, labels } =
      this.buildPeriodRanges(period, now);

    const [thisMonthData, lastMonthData] = await Promise.all([
      this.fetchRevenueByPeriod(doctorId, thisStart, thisEnd, period),
      this.fetchRevenueByPeriod(doctorId, lastStart, lastEnd, period),
    ]);

    const data: RevenueDataPoint[] = labels.map((label, i) => ({
      label,
      thisMonth: thisMonthData[i] ?? 0,
      lastMonth: lastMonthData[i] ?? 0,
    }));

    return {
      data,
      totalThisMonth: thisMonthData.reduce((a, b) => a + b, 0),
      totalLastMonth: lastMonthData.reduce((a, b) => a + b, 0),
    };
  }

  // ── Private Helpers ───────────────────────────────────────────────────────

  public  async resolveDoctor(authAccountId: string) {
    if (!Types.ObjectId.isValid(authAccountId)) {
      throw new BadRequestException('doctor.INVALID_ID');
    }

    const doctor = await this.doctorModel
      .findOne({ authAccountId: new Types.ObjectId(authAccountId) })
      .lean();

    if (!doctor) throw new NotFoundException('doctor.NOT_FOUND');

    return doctor;
  }

  private buildPeriodRanges(period: string, now: Date) {
    if (period === 'week') {
      // Last 7 days vs 7 days before that
      const thisStart = new Date(now);
      thisStart.setDate(now.getDate() - 6);
      thisStart.setHours(0, 0, 0, 0);
      const thisEnd = new Date(now);
      thisEnd.setHours(23, 59, 59, 999);

      const lastEnd = new Date(thisStart);
      lastEnd.setDate(lastEnd.getDate() - 1);
      lastEnd.setHours(23, 59, 59, 999);
      const lastStart = new Date(lastEnd);
      lastStart.setDate(lastStart.getDate() - 6);
      lastStart.setHours(0, 0, 0, 0);

      const labels = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(thisStart);
        d.setDate(d.getDate() + i);
        return d.toLocaleDateString('en', { weekday: 'short' });
      });

      return { thisStart, thisEnd, lastStart, lastEnd, labels };
    }

    // Default: current month vs last month, grouped by day
    const thisStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const thisEnd = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0,
      23,
      59,
      59,
    );
    const lastStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
    const daysInMonth = thisEnd.getDate();
    const labels = Array.from({ length: daysInMonth }, (_, i) => String(i + 1));

    return { thisStart, thisEnd, lastStart, lastEnd, labels };
  }

  private async fetchRevenueByPeriod(
    doctorId: Types.ObjectId,
    start: Date,
    end: Date,
    period: string,
  ): Promise<number[]> {
    const format = period === 'week' ? '%Y-%m-%d' : '%d';

    const rows = await this.bookingModel.aggregate([
      {
        $match: {
          doctorId,
          bookingDate: { $gte: start, $lte: end },
          status: BookingStatus.COMPLETED,
        },
      },
      {
        $group: {
          _id: { $dateToString: { format, date: '$bookingDate' } },
          revenue: { $sum: '$price' },
        },
      },
    ]);

    const map = new Map(
      rows.map((r) => [r._id as string, r.revenue as number]),
    );

    // Build ordered array matching the labels
    if (period === 'week') {
      return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(start);
        d.setDate(d.getDate() + i);
        const key = d.toISOString().split('T')[0];
        return map.get(key) ?? 0;
      });
    }

    const days = end.getDate();
    return Array.from(
      { length: days },
      (_, i) => map.get(String(i + 1).padStart(2, '0')) ?? 0,
    );
  }
}
