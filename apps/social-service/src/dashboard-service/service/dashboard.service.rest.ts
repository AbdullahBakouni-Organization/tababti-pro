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
import {
  BookingStatus,
  WorkigEntity,
} from '@app/common/database/schemas/common.enums';

import {
  DashboardQueryDto,
  CalendarQueryDto,
  LocationChartQueryDto,
  AppointmentsQueryDto,
  StatsQueryDto,
  GenderStatsQueryDto,
  DoctorDashboardDto,
  DashboardStatsDto,
  RecentPatientDto,
  CalendarMonthDto,
  CalendarDayDto,
  AppointmentsTableResultDto,
  AppointmentRowDto,
  GenderStatsDto,
  LocationChartDto,
  LocationChartDataPointDto,
} from '../dto/dashboard-query.dto';

// ─── Location type mapping ────────────────────────────────────────────────────
const LOCATION_BUCKETS: Record<string, 'clinic' | 'hospital' | 'center'> = {
  [WorkigEntity.CLINIC?.toLowerCase?.() ?? 'clinic']: 'clinic',
  clinic: 'clinic',
  عيادة: 'clinic',

  [WorkigEntity.HOSPITAL?.toLowerCase?.() ?? 'hospital']: 'hospital',
  hospital: 'hospital',
  مشفى: 'hospital',
  مستشفى: 'hospital',

  [WorkigEntity.CENTER?.toLowerCase?.() ?? 'center']: 'center',
  center: 'center',
  مركز: 'center',
};

function toBucket(raw: string): 'clinic' | 'hospital' | 'center' | null {
  return LOCATION_BUCKETS[(raw ?? '').toLowerCase().trim()] ?? null;
}

function resolveRefDate(selectedDate?: string): Date {
  if (!selectedDate) return new Date();
  const d = new Date(selectedDate);
  return isNaN(d.getTime()) ? new Date() : d;
}

// ═══════════════════════════════════════════════════════════════
// REST API SERVICE (same logic as GraphQL but with DTOs)
// ═══════════════════════════════════════════════════════════════

@Injectable()
export class DashboardService {
  constructor(
    @InjectModel(Booking.name)
    private readonly bookingModel: Model<Booking>,
    @InjectModel(Doctor.name)
    private readonly doctorModel: Model<Doctor>,
    @InjectModel(User.name)
    private readonly userModel: Model<User>,
  ) {}

  // ═══════════════════════════════════════════════════════════════
  // FULL DASHBOARD
  // ═══════════════════════════════════════════════════════════════

  async getDoctorDashboard(
    accountId: string,
    query: DashboardQueryDto,
  ): Promise<DoctorDashboardDto> {
    const doctor = await this.resolveDoctor(accountId);
    const doctorId = doctor._id as Types.ObjectId;
    const refDate = resolveRefDate(query.selectedDate);

    const [
      stats,
      recentPatients,
      calendar,
      appointments,
      genderStats,
      locationChart,
    ] = await Promise.all([
      this.getStats(accountId, { selectedDate: query.selectedDate }),
      this.getRecentPatients(accountId),
      this.getCalendar(accountId, {
        year: refDate.getFullYear(),
        month: refDate.getMonth() + 1,
      }),
      this.getAppointments(accountId, {
        monthDate: query.selectedDate,
        page: query.page ?? 1,
        limit: query.limit ?? 10,
      }),
      this.getGenderStats(accountId, { selectedDate: query.selectedDate }),
      this.getLocationChart(accountId, {
        period: query.period ?? 'week',
        selectedDate: query.selectedDate,
      }),
    ]);

    const fullName = [doctor.firstName, doctor.middleName, doctor.lastName]
      .filter(Boolean)
      .join(' ');

    return {
      doctorId: doctorId.toString(),
      doctorName: fullName,
      doctorImage: doctor.image ?? undefined,
      stats,
      recentPatients,
      calendar,
      appointments,
      genderStats,
      locationChart,
    };
  }

  async getDoctorDashboardById(
    doctorId: string,
    query: DashboardQueryDto,
  ): Promise<DoctorDashboardDto> {
    if (!Types.ObjectId.isValid(doctorId)) {
      throw new BadRequestException('Invalid doctor ID');
    }

    const doctor = await this.doctorModel.findById(doctorId).lean();
    if (!doctor) {
      throw new NotFoundException('Doctor not found');
    }

    const docId = doctor._id as Types.ObjectId;
    const refDate = resolveRefDate(query.selectedDate);

    const [
      stats,
      recentPatients,
      calendar,
      appointments,
      genderStats,
      locationChart,
    ] = await Promise.all([
      this._getStatsRaw(docId, refDate),
      this._getRecentPatientsRaw(docId),
      this._getCalendarRaw(docId, {
        year: refDate.getFullYear(),
        month: refDate.getMonth() + 1,
      }),
      this._getAppointmentsRaw(docId, {
        monthDate: query.selectedDate,
        page: query.page ?? 1,
        limit: query.limit ?? 10,
      }),
      this._getGenderStatsRaw(docId, refDate),
      this._buildLocationChart(docId, query.period ?? 'week', refDate),
    ]);

    const fullName = [doctor.firstName, doctor.middleName, doctor.lastName]
      .filter(Boolean)
      .join(' ');

    return {
      doctorId: docId.toString(),
      doctorName: fullName,
      doctorImage: doctor.image ?? undefined,
      stats,
      recentPatients,
      calendar,
      appointments,
      genderStats,
      locationChart,
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // STATS
  // ═══════════════════════════════════════════════════════════════

  async getStats(
    accountId: string,
    query: StatsQueryDto,
  ): Promise<DashboardStatsDto> {
    const doctor = await this.resolveDoctor(accountId);
    const doctorId = doctor._id as Types.ObjectId;
    const refDate = resolveRefDate(query.selectedDate);
    return this._getStatsRaw(doctorId, refDate);
  }

  private async _getStatsRaw(
    doctorId: Types.ObjectId,
    refDate: Date = new Date(),
  ): Promise<DashboardStatsDto> {
    const y = refDate.getFullYear();
    const m = refDate.getMonth();

    const startOfMonth = new Date(y, m, 1, 0, 0, 0, 0);
    const endOfMonth = new Date(y, m + 1, 0, 23, 59, 59, 999);
    const startOfLastMonth = new Date(y, m - 1, 1, 0, 0, 0, 0);
    const endOfLastMonth = new Date(y, m, 0, 23, 59, 59, 999);

    const [currentAgg, lastAgg] = await Promise.all([
      this.bookingModel.aggregate([
        {
          $match: {
            doctorId,
            bookingDate: { $gte: startOfMonth, $lte: endOfMonth },
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

    let total = 0,
      completed = 0,
      revenue = 0;
    for (const row of currentAgg) {
      total += row.count;
      if (row._id === BookingStatus.COMPLETED) {
        completed += row.count;
        revenue += row.revenue;
      }
    }

    const lastRevenue = lastAgg[0]?.total ?? 0;
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

  // ═══════════════════════════════════════════════════════════════
  // RECENT PATIENTS
  // ═══════════════════════════════════════════════════════════════

  async getRecentPatients(accountId: string): Promise<RecentPatientDto[]> {
    const doctor = await this.resolveDoctor(accountId);
    const doctorId = doctor._id as Types.ObjectId;
    return this._getRecentPatientsRaw(doctorId);
  }

  private async _getRecentPatientsRaw(
    doctorId: Types.ObjectId,
  ): Promise<RecentPatientDto[]> {
    const bookings = await this.bookingModel.aggregate([
      {
        $match: {
          doctorId,
          status: {
            $in: [BookingStatus.PENDING, BookingStatus.CONFIRMED],
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

  // ═══════════════════════════════════════════════════════════════
  // CALENDAR
  // ═══════════════════════════════════════════════════════════════

  async getCalendar(
    accountId: string,
    query: CalendarQueryDto,
  ): Promise<CalendarMonthDto> {
    const doctor = await this.resolveDoctor(accountId);
    const doctorId = doctor._id as Types.ObjectId;
    return this._getCalendarRaw(doctorId, query);
  }

  private async _getCalendarRaw(
    doctorId: Types.ObjectId,
    query: CalendarQueryDto,
  ): Promise<CalendarMonthDto> {
    const start = new Date(query.year, query.month - 1, 1, 0, 0, 0, 0);
    const end = new Date(query.year, query.month, 0, 23, 59, 59, 999);

    const rows = await this.bookingModel.aggregate([
      {
        $match: {
          doctorId,
          bookingDate: { $gte: start, $lte: end },
          status: {
            $nin: [
              BookingStatus.CANCELLED_BY_PATIENT,
              BookingStatus.CANCELLED_BY_DOCTOR,
            ],
          },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$bookingDate' } },
          count: { $sum: 1 },
        },
      },
    ]);

    const countMap = new Map<string, number>(
      rows.map((r) => [r._id as string, r.count as number]),
    );

    const days: CalendarDayDto[] = [];
    for (let d = 1; d <= end.getDate(); d++) {
      const dateStr = `${query.year}-${String(query.month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const count = countMap.get(dateStr) ?? 0;
      days.push({
        date: dateStr,
        appointmentCount: count,
        hasAppointments: count > 0,
      });
    }

    return { year: query.year, month: query.month, days };
  }

  // ═══════════════════════════════════════════════════════════════
  // APPOINTMENTS TABLE
  // ═══════════════════════════════════════════════════════════════

  async getAppointments(
    accountId: string,
    query: AppointmentsQueryDto,
  ): Promise<AppointmentsTableResultDto> {
    const doctor = await this.resolveDoctor(accountId);
    const doctorId = doctor._id as Types.ObjectId;
    return this._getAppointmentsRaw(doctorId, query);
  }

  private async _getAppointmentsRaw(
    doctorId: Types.ObjectId,
    query: AppointmentsQueryDto,
  ): Promise<AppointmentsTableResultDto> {
    const page = Math.max(query.page ?? 1, 1);
    const limit = Math.min(query.limit ?? 10, 50);
    const skip = (page - 1) * limit;

    const match: Record<string, any> = { doctorId };

    if (query.date) {
      const day = new Date(query.date);
      const nextDay = new Date(query.date);
      nextDay.setDate(nextDay.getDate() + 1);
      match.bookingDate = { $gte: day, $lt: nextDay };
    }
    if (query.monthDate) {
      const d = new Date(query.monthDate);
      const start = new Date(d.getFullYear(), d.getMonth(), 1);
      const end = new Date(
        d.getFullYear(),
        d.getMonth() + 1,
        0,
        23,
        59,
        59,
        999,
      );
      match.bookingDate = { $gte: start, $lte: end };
    }
    if (query.status) match.status = query.status;

    const result = await this.bookingModel.aggregate([
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
    ]);

    const raw = result[0]?.data ?? [];
    const total = result[0]?.totalCount?.[0]?.count ?? 0;

    return {
      appointments: raw.map((r: any) => ({
        bookingId: r.bookingId?.toString() ?? '',
        patientName: r.patientName ?? 'Unknown',
        patientImage: r.patientImage ?? undefined,
        gender: r.gender ?? '',
        time: r.time ?? '',
        date: r.date ?? '',
        locationName: r.locationName ?? '',
        status: r.status ?? '',
      })),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // GENDER STATS (DONUT)
  // ═══════════════════════════════════════════════════════════════

  async getGenderStats(
    accountId: string,
    query: GenderStatsQueryDto,
  ): Promise<GenderStatsDto> {
    const doctor = await this.resolveDoctor(accountId);
    const doctorId = doctor._id as Types.ObjectId;
    const refDate = resolveRefDate(query.selectedDate);
    return this._getGenderStatsRaw(doctorId, refDate);
  }

  private async _getGenderStatsRaw(
    doctorId: Types.ObjectId,
    refDate: Date = new Date(),
  ): Promise<GenderStatsDto> {
    const y = refDate.getFullYear();
    const m = refDate.getMonth();

    const startOfMonth = new Date(y, m, 1, 0, 0, 0, 0);
    const endOfMonth = new Date(y, m + 1, 0, 23, 59, 59, 999);

    const rows = await this.bookingModel.aggregate([
      {
        $match: {
          doctorId,
          bookingDate: { $gte: startOfMonth, $lte: endOfMonth },
          status: {
            $nin: [
              BookingStatus.CANCELLED_BY_PATIENT,
              BookingStatus.CANCELLED_BY_DOCTOR,
            ],
          },
        },
      },
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
        $group: {
          _id: { $toLower: { $ifNull: ['$patient.gender', 'unknown'] } },
          count: { $sum: 1 },
        },
      },
    ]);

    let maleCount = 0,
      femaleCount = 0;
    for (const row of rows) {
      const g = (row._id ?? '').toLowerCase();
      if (g === 'male' || g === 'm') maleCount = row.count;
      if (g === 'female' || g === 'f') femaleCount = row.count;
    }

    const totalPatients = maleCount + femaleCount;
    const malePercent =
      totalPatients > 0
        ? Math.round((maleCount / totalPatients) * 1000) / 10
        : 0;
    const femalePercent =
      totalPatients > 0
        ? Math.round((femaleCount / totalPatients) * 1000) / 10
        : 0;

    const stats = await this._getStatsRaw(doctorId, refDate);
    const completionPercent =
      stats.totalAppointments > 0
        ? Math.round(
            (stats.completedAppointments / stats.totalAppointments) * 1000,
          ) / 10
        : 0;

    return {
      maleCount,
      femaleCount,
      totalPatients,
      malePercent,
      femalePercent,
      completionPercent,
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // LOCATION CHART
  // ═══════════════════════════════════════════════════════════════

  async getLocationChart(
    accountId: string,
    query: LocationChartQueryDto,
  ): Promise<LocationChartDto> {
    const doctor = await this.resolveDoctor(accountId);
    const doctorId = doctor._id as Types.ObjectId;
    const refDate = resolveRefDate(query.selectedDate);
    return this._buildLocationChart(doctorId, query.period ?? 'week', refDate);
  }

  private async _buildLocationChart(
    doctorId: Types.ObjectId,
    period: 'week' | 'month',
    refDate: Date,
  ): Promise<LocationChartDto> {
    const { start, end, labels } = this._periodBounds(period, refDate);
    const format = period === 'week' ? '%Y-%m-%d' : '%d';

    const rows = await this.bookingModel.aggregate([
      {
        $match: {
          doctorId,
          bookingDate: { $gte: start, $lte: end },
          status: {
            $nin: [
              BookingStatus.CANCELLED_BY_PATIENT,
              BookingStatus.CANCELLED_BY_DOCTOR,
            ],
          },
        },
      },
      {
        $group: {
          _id: {
            day: { $dateToString: { format, date: '$bookingDate' } },
            loc: { $toLower: { $ifNull: ['$location.type', ''] } },
          },
          count: { $sum: 1 },
        },
      },
    ]);

    const map = new Map<string, number>();
    for (const r of rows) {
      const bucket = toBucket(r._id.loc);
      if (bucket) {
        const key = `${r._id.day}|${bucket}`;
        map.set(key, (map.get(key) ?? 0) + r.count);
      }
    }

    let totalClinic = 0,
      totalHospital = 0,
      totalCenter = 0;

    const data: LocationChartDataPointDto[] = labels.map((label, i) => {
      const d = new Date(start);
      d.setDate(d.getDate() + i);

      const dayKey =
        period === 'week'
          ? d.toISOString().split('T')[0]
          : String(i + 1).padStart(2, '0');

      const isoDate = d.toISOString().split('T')[0];

      const clinic = map.get(`${dayKey}|clinic`) ?? 0;
      const hospital = map.get(`${dayKey}|hospital`) ?? 0;
      const center = map.get(`${dayKey}|center`) ?? 0;

      totalClinic += clinic;
      totalHospital += hospital;
      totalCenter += center;

      return { label, date: isoDate, clinic, hospital, center };
    });

    return {
      data,
      totalClinic,
      totalHospital,
      totalCenter,
      totalAppointments: totalClinic + totalHospital + totalCenter,
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // RESOLVE DOCTOR
  // ═══════════════════════════════════════════════════════════════

  async resolveDoctor(authAccountId: string) {
    if (!Types.ObjectId.isValid(authAccountId))
      throw new BadRequestException('doctor.INVALID_ID');

    const doctor = await this.doctorModel
      .findOne({ authAccountId: new Types.ObjectId(authAccountId) })
      .lean();

    if (!doctor) throw new NotFoundException('doctor.NOT_FOUND');
    return doctor;
  }

  // ═══════════════════════════════════════════════════════════════
  // PERIOD BOUNDS HELPER
  // ═══════════════════════════════════════════════════════════════

  private _periodBounds(period: 'week' | 'month', refDate: Date) {
    if (period === 'week') {
      const end = new Date(refDate);
      end.setHours(23, 59, 59, 999);
      const start = new Date(refDate);
      start.setDate(refDate.getDate() - 6);
      start.setHours(0, 0, 0, 0);
      const labels = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(start);
        d.setDate(d.getDate() + i);
        return d.toLocaleDateString('en', { weekday: 'short' });
      });
      return { start, end, labels };
    }

    const y = refDate.getFullYear(),
      m = refDate.getMonth();
    const start = new Date(y, m, 1, 0, 0, 0, 0);
    const end = new Date(y, m + 1, 0, 23, 59, 59, 999);
    const labels = Array.from({ length: end.getDate() }, (_, i) =>
      String(i + 1),
    );
    return { start, end, labels };
  }
}
