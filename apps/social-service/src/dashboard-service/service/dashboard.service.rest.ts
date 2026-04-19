import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, PipelineStage, Types } from 'mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';

import { Booking } from '@app/common/database/schemas/booking.schema';
import { Doctor } from '@app/common/database/schemas/doctor.schema';
import {
  BookingStatus,
  UserRole,
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
  CalendarMonthDto,
  CalendarDayDto,
  AppointmentsTableResultDto,
  GenderStatsDto,
  LocationChartDto,
  LocationChartDataPointDto,
  RecentPatientsResponseDto,
  MonthlyIncomeQueryDto,
  MonthlyIncomeDto,
  MonthlyIncomeBucketDto,
} from '../dto/dashboard-query.dto';
import { Question } from '@app/common/database/schemas/question.schema';
import { Answer } from '@app/common/database/schemas/answer.schema';
import { Post } from '@app/common/database/schemas/post.schema';
import {
  DoctorStatsResponseDto,
  MonthlyStatDto,
} from '../dto/doctor-community-stats.dto';

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

// ─── Month name mappings ──────────────────────────────────────────────────────
// Index 0 = January. Keep both arrays in lock-step.
const MONTH_KEYS_EN = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];
const MONTH_LABELS_AR = [
  'كانون الثاني',
  'شباط',
  'آذار',
  'نيسان',
  'أيار',
  'حزيران',
  'تموز',
  'آب',
  'أيلول',
  'تشرين الأول',
  'تشرين الثاني',
  'كانون الأول',
];

function resolveRefDate(selectedDate?: string): Date {
  if (!selectedDate) return new Date();
  const d = new Date(selectedDate);
  return isNaN(d.getTime()) ? new Date() : d;
}

// ─── Cache entry shape ────────────────────────────────────────────────────────
interface CacheEntry<T> {
  data: T;
  cachedAt: Date;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SERVICE
// ═══════════════════════════════════════════════════════════════════════════════

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(
    @InjectModel(Booking.name)
    private readonly bookingModel: Model<Booking>,
    @InjectModel(Doctor.name)
    private readonly doctorModel: Model<Doctor>,
    @InjectModel(Question.name) private readonly questionModel: Model<Question>,
    @InjectModel(Answer.name) private readonly answerModel: Model<Answer>,
    @InjectModel(Post.name) private readonly postModel: Model<Post>,
  ) {}

  // ═══════════════════════════════════════════════════════════════════════════
  // IN-MEMORY CACHES
  // Key = doctor profile _id string
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Recent-patients cache.
   * Populated on first request per doctor; refreshed every 2 h by cron.
   */
  private readonly _recentPatientsCache = new Map<
    string,
    CacheEntry<RecentPatientsResponseDto>
  >();

  /**
   * Location-chart cache (period=week, today as refDate).
   * Populated on first request per doctor; fully rebuilt every midnight by cron.
   * Requests with a custom date or period=month always bypass this cache.
   */
  private readonly _locationChartCache = new Map<
    string,
    CacheEntry<LocationChartDto>
  >();

  // ═══════════════════════════════════════════════════════════════════════════
  // CRON — RECENT PATIENTS   every 2 hours  (0 */2 * * *)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Fires at 00:00, 02:00, 04:00 … 22:00 every day.
   * Iterates all doctor records and refreshes the recent-patients cache for
   * each one in parallel.  A failure for one doctor is isolated — it never
   * blocks others and the stale entry is kept rather than evicted.
   */
  @Cron('0 */2 * * *', { name: 'refresh-recent-patients' })
  async cronRefreshRecentPatients(): Promise<void> {
    this.logger.log('[CRON] refresh-recent-patients started');

    const doctors = await this.doctorModel
      .find({}, { _id: 1 })
      .lean()
      .catch((err) => {
        this.logger.error(
          '[CRON] refresh-recent-patients — failed to load doctors',
          err,
        );
        return [] as Array<{ _id: Types.ObjectId }>;
      });

    const results = await Promise.allSettled(
      doctors.map(async (doc) => {
        const doctorId = doc._id as Types.ObjectId;
        const key = doctorId.toString();
        const data = await this._getRecentPatientsRaw(doctorId);
        this._recentPatientsCache.set(key, { data, cachedAt: new Date() });
      }),
    );

    const failed = results.filter((r) => r.status === 'rejected').length;
    this.logger.log(
      `[CRON] refresh-recent-patients done — ${doctors.length - failed}/${doctors.length} refreshed`,
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CRON — LOCATION CHART   every day at midnight
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Fires at 00:00 every day.
   * Rebuilds the location-chart cache (week period, new day as reference)
   * for every doctor so the first request of the day is always instant.
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT, {
    name: 'refresh-location-chart',
  })
  async cronRefreshLocationChart(): Promise<void> {
    this.logger.log('[CRON] refresh-location-chart started');

    const today = new Date();

    const doctors = await this.doctorModel
      .find({}, { _id: 1 })
      .lean()
      .catch((err) => {
        this.logger.error(
          '[CRON] refresh-location-chart — failed to load doctors',
          err,
        );
        return [] as Array<{ _id: Types.ObjectId }>;
      });

    const results = await Promise.allSettled(
      doctors.map(async (doc) => {
        const doctorId = doc._id as Types.ObjectId;
        const key = doctorId.toString();
        const data = await this._buildLocationChart(doctorId, 'week', today);
        this._locationChartCache.set(key, { data, cachedAt: new Date() });
      }),
    );

    const failed = results.filter((r) => r.status === 'rejected').length;
    this.logger.log(
      `[CRON] refresh-location-chart done — ${doctors.length - failed}/${doctors.length} refreshed`,
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CACHE HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Returns cached recent patients, or fetches fresh data on a cache miss
   * (first call after startup before the cron has run).
   */
  private async _getRecentPatientsCached(
    doctorId: Types.ObjectId,
  ): Promise<RecentPatientsResponseDto> {
    const data = await this._getRecentPatientsRaw(doctorId);
    return data;
  }

  /**
   * Returns cached location chart when the request matches the warmed
   * combination (period=week + today).  All other combinations bypass the
   * cache and always hit the DB directly.
   */
  private async _getLocationChartCached(
    doctorId: Types.ObjectId,
    period: 'week' | 'month',
    refDate: Date,
  ): Promise<LocationChartDto> {
    const key = doctorId.toString();
    const today = new Date();
    const isCacheableRequest =
      period === 'week' && refDate.toDateString() === today.toDateString();

    if (isCacheableRequest) {
      const hit = this._locationChartCache.get(key);
      if (hit) return hit.data;
      this.logger.debug(`[CACHE MISS] location-chart for doctor ${key}`);
    }

    const data = await this._buildLocationChart(doctorId, period, refDate);

    // Populate cache for future requests if this is the warmed combination
    if (isCacheableRequest) {
      this._locationChartCache.set(key, { data, cachedAt: new Date() });
    }

    return data;
  }

  // ─── Public cache-info accessors (used by controller debug endpoints) ──────

  getCacheInfo(doctorId: string): {
    recentPatients: { cachedAt: Date } | null;
    locationChart: { cachedAt: Date } | null;
  } {
    const rp = this._recentPatientsCache.get(doctorId);
    const lc = this._locationChartCache.get(doctorId);
    return {
      recentPatients: rp ? { cachedAt: rp.cachedAt } : null,
      locationChart: lc ? { cachedAt: lc.cachedAt } : null,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FULL DASHBOARD
  // ═══════════════════════════════════════════════════════════════════════════

  async getDoctorDashboard(
    accountId: string,
    query: DashboardQueryDto,
  ): Promise<DoctorDashboardDto> {
    const doctor = await this.resolveDoctor(accountId);
    const doctorId = doctor._id;
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
      this._getRecentPatientsCached(doctorId), // ← cache
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
      this._getLocationChartCached(doctorId, query.period ?? 'week', refDate), // ← cache
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
    if (!doctor) throw new NotFoundException('Doctor not found');

    const docId = doctor._id;
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
      this._getRecentPatientsCached(docId), // ← cache
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
      this._getLocationChartCached(docId, query.period ?? 'week', refDate), // ← cache
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

  // ═══════════════════════════════════════════════════════════════════════════
  // STATS
  // ═══════════════════════════════════════════════════════════════════════════

  async getStats(
    accountId: string,
    query: StatsQueryDto,
  ): Promise<DashboardStatsDto> {
    const doctor = await this.resolveDoctor(accountId);
    const doctorId = doctor._id;
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

    const currentWeekStart = new Date(refDate);
    currentWeekStart.setDate(refDate.getDate() - 6);
    currentWeekStart.setHours(0, 0, 0, 0);
    const currentWeekEnd = new Date(refDate);
    currentWeekEnd.setHours(23, 59, 59, 999);
    const lastWeekStart = new Date(refDate);
    lastWeekStart.setDate(refDate.getDate() - 13);
    lastWeekStart.setHours(0, 0, 0, 0);
    const lastWeekEnd = new Date(refDate);
    lastWeekEnd.setDate(refDate.getDate() - 7);
    lastWeekEnd.setHours(23, 59, 59, 999);

    const statusGroupPipeline = (start: Date, end: Date): PipelineStage[] => [
      { $match: { doctorId, bookingDate: { $gte: start, $lte: end } } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          revenue: { $sum: '$price' },
        },
      },
    ];

    const [currentAgg, lastAgg, currentWeekAgg, lastWeekAgg] =
      await Promise.all([
        this.bookingModel.aggregate(
          statusGroupPipeline(startOfMonth, endOfMonth),
        ),
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
        this.bookingModel.aggregate(
          statusGroupPipeline(currentWeekStart, currentWeekEnd),
        ),
        this.bookingModel.aggregate(
          statusGroupPipeline(lastWeekStart, lastWeekEnd),
        ),
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

    const summarizeWeek = (
      rows: Array<{ _id: string; count: number; revenue: number }>,
    ) => {
      let t = 0,
        c = 0,
        r = 0;
      for (const row of rows) {
        t += row.count;
        if (row._id === BookingStatus.COMPLETED) {
          c += row.count;
          r += row.revenue;
        }
      }
      return { total: t, completed: c, incomplete: t - c, revenue: r };
    };

    const cw = summarizeWeek(currentWeekAgg);
    const lw = summarizeWeek(lastWeekAgg);

    const pctChange = (curr: number, prev: number): number => {
      if (prev === 0) return curr > 0 ? 100 : 0;
      return Math.round(((curr - prev) / prev) * 100);
    };

    return {
      totalAppointments: total,
      completedAppointments: completed,
      incompleteAppointments: total - completed,
      estimatedRevenue: revenue,
      revenueChangePercent,
      weeklyNewAppointments: cw.total,
      totalAppointmentsChange: pctChange(cw.total, lw.total),
      weeklyCompletedAppointments: cw.completed,
      completedAppointmentsChange: pctChange(cw.completed, lw.completed),
      weeklyIncompleteAppointments: cw.incomplete,
      incompleteAppointmentsChange: pctChange(cw.incomplete, lw.incomplete),
      weeklyRevenue: cw.revenue,
      revenueChange: pctChange(cw.revenue, lw.revenue),
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RECENT PATIENTS   (public method routes through cache)
  // ═══════════════════════════════════════════════════════════════════════════

  async getRecentPatients(
    accountId: string,
  ): Promise<RecentPatientsResponseDto> {
    const doctor = await this.resolveDoctor(accountId);
    const doctorId = doctor._id;
    return this._getRecentPatientsCached(doctorId); // ← was _getRecentPatientsRaw
  }

  private async _getRecentPatientsRaw(
    doctorId: Types.ObjectId,
    page = 1,
    limit = 10,
  ): Promise<RecentPatientsResponseDto> {
    const skip = (page - 1) * limit;

    const result = await this.bookingModel.aggregate([
      {
        $match: {
          doctorId,
          status: { $in: [BookingStatus.COMPLETED] },
        },
      },

      { $sort: { bookingDate: -1, bookingTime: 1 } },

      {
        $facet: {
          data: [
            { $skip: skip },
            { $limit: limit },

            {
              $lookup: {
                from: 'users',
                localField: 'patientId',
                foreignField: '_id',
                as: 'patient',
                pipeline: [
                  {
                    $project: {
                      username: 1,
                      profileImage: 1,
                      gender: 1,
                      phone: 1,
                    },
                  },
                ],
              },
            },

            { $unwind: { path: '$patient', preserveNullAndEmptyArrays: true } },

            {
              $project: {
                patientId: { $toString: '$patientId' },
                bookingId: { $toString: '$_id' },

                Patientname: {
                  $ifNull: [
                    '$patient.username',
                    { $ifNull: ['$patientName', 'Unknown'] },
                  ],
                },
                Patientphone: {
                  $ifNull: ['$patient.phone', '$patientPhone'],
                },
                Patientimage: '$patient.profileImage',
                Patientgender: '$patient.gender',

                locationName: '$location.entity_name',

                bookingDate: {
                  $dateToString: {
                    format: '%Y/%m/%d',
                    date: '$bookingDate',
                  },
                },

                bookingTime: 1,
                status: 1,
              },
            },
          ],

          totalCount: [{ $count: 'count' }],
        },
      },
    ]);

    const data = result[0]?.data ?? [];
    const total = result[0]?.totalCount?.[0]?.count ?? 0;

    return {
      patients: data,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CALENDAR
  // ═══════════════════════════════════════════════════════════════════════════

  async getCalendar(
    accountId: string,
    query: CalendarQueryDto,
  ): Promise<CalendarMonthDto> {
    const doctor = await this.resolveDoctor(accountId);
    const doctorId = doctor._id;
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

  // ═══════════════════════════════════════════════════════════════════════════
  // APPOINTMENTS TABLE
  // ═══════════════════════════════════════════════════════════════════════════

  async getAppointments(
    accountId: string,
    query: AppointmentsQueryDto,
  ): Promise<AppointmentsTableResultDto> {
    const doctor = await this.resolveDoctor(accountId);
    const doctorId = doctor._id;
    return this._getAppointmentsRaw(doctorId, query);
  }

  private async _getAppointmentsRaw(
    doctorId: Types.ObjectId,
    query: AppointmentsQueryDto,
  ): Promise<AppointmentsTableResultDto> {
    const page = Math.max(query.page ?? 1, 1);
    const limit = Math.min(query.limit ?? 10, 50);
    const skip = (page - 1) * limit;

    const match: Record<string, unknown> = {
      doctorId,
      status: {
        $in: [BookingStatus.PENDING],
      },
    };

    if (query.date) {
      const start = new Date(query.date);
      const end = new Date(query.date);
      end.setDate(end.getDate() + 1);

      match.bookingDate = { $gte: start, $lt: end };
    }

    if (query.monthDate) {
      const d = new Date(query.monthDate);

      const start = new Date(d.getFullYear(), d.getMonth(), 1);
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 1);

      match.bookingDate = { $gte: start, $lt: end };
    }

    const pipeline: PipelineStage[] = [
      { $match: match },

      { $sort: { bookingDate: -1, bookingTime: 1 } },

      {
        $lookup: {
          from: 'users',
          localField: 'patientId',
          foreignField: '_id',
          as: 'patient',
          pipeline: [
            {
              $project: {
                username: 1,
                profileImage: 1,
                gender: 1,
              },
            },
          ],
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
                bookingId: { $toString: '$_id' },
                patientName: {
                  $ifNull: [
                    '$patient.username',
                    { $ifNull: ['$patientName', 'Unknown'] },
                  ],
                },
                patientImage: '$patient.profileImage',
                gender: '$patient.gender',
                time: '$bookingTime',
                date: {
                  $dateToString: {
                    format: '%Y/%m/%d',
                    date: '$bookingDate',
                  },
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

    return {
      appointments: raw,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GENDER STATS (DONUT)
  // ═══════════════════════════════════════════════════════════════════════════

  async getGenderStats(
    accountId: string,
    query: GenderStatsQueryDto,
  ): Promise<GenderStatsDto> {
    const doctor = await this.resolveDoctor(accountId);
    const doctorId = doctor._id;
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

  // ═══════════════════════════════════════════════════════════════════════════
  // LOCATION CHART   (public method routes through cache)
  // ═══════════════════════════════════════════════════════════════════════════

  async getLocationChart(
    accountId: string,
    query: LocationChartQueryDto,
  ): Promise<LocationChartDto> {
    const doctor = await this.resolveDoctor(accountId);
    const doctorId = doctor._id;
    const refDate = resolveRefDate(query.selectedDate);
    return this._getLocationChartCached(
      doctorId,
      query.period ?? 'week',
      refDate,
    ); // ← was _buildLocationChart
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

  // ═══════════════════════════════════════════════════════════════════════════
  // MONTHLY INCOME
  // ═══════════════════════════════════════════════════════════════════════════

  async getMonthlyIncome(
    accountId: string,
    query: MonthlyIncomeQueryDto,
  ): Promise<MonthlyIncomeDto> {
    const doctor = await this.resolveDoctor(accountId);
    const doctorId = doctor._id;
    const months = query.months ?? 3;
    return this._getMonthlyIncomeRaw(doctorId, months);
  }

  private async _getMonthlyIncomeRaw(
    doctorId: Types.ObjectId,
    monthsCount: number,
  ): Promise<MonthlyIncomeDto> {
    const now = new Date();
    const endMonthIndex = now.getMonth();
    const endYear = now.getFullYear();

    // Inclusive window: N trailing months ending on current month.
    const windowStart = new Date(endYear, endMonthIndex - (monthsCount - 1), 1);
    const windowEnd = new Date(endYear, endMonthIndex + 1, 0, 23, 59, 59, 999);

    const rows = await this.bookingModel.aggregate([
      {
        $match: {
          doctorId,
          bookingDate: { $gte: windowStart, $lte: windowEnd },
          status: BookingStatus.COMPLETED,
        },
      },
      {
        $group: {
          _id: {
            y: { $year: '$bookingDate' },
            m: { $month: '$bookingDate' },
          },
          total: { $sum: '$price' },
        },
      },
    ]);

    const totalsByKey = new Map<string, number>();
    for (const r of rows) {
      totalsByKey.set(`${r._id.y}-${r._id.m}`, r.total ?? 0);
    }

    const buckets: MonthlyIncomeBucketDto[] = [];
    for (let i = monthsCount - 1; i >= 0; i--) {
      const d = new Date(endYear, endMonthIndex - i, 1);
      const y = d.getFullYear();
      const monthIndex = d.getMonth(); // 0-based
      const rawTotal = totalsByKey.get(`${y}-${monthIndex + 1}`) ?? 0;
      buckets.push({
        key: MONTH_KEYS_EN[monthIndex],
        label: MONTH_LABELS_AR[monthIndex],
        monthIndex,
        year: y,
        value: Math.round(rawTotal * 100) / 100,
      });
    }

    // Peak bucket — highest value; ties → most recent (latest index wins).
    let peakIdx = 0;
    for (let i = 1; i < buckets.length; i++) {
      if (buckets[i].value >= buckets[peakIdx].value) peakIdx = i;
    }
    const peak = buckets[peakIdx];

    return {
      currency: 'USD',
      months: buckets,
      peak: { key: peak.key, value: peak.value },
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RESOLVE DOCTOR
  // ═══════════════════════════════════════════════════════════════════════════

  async resolveDoctor(authAccountId: string) {
    // if (!Types.ObjectId.isValid(authAccountId))
    //   throw new BadRequestException('doctor.INVALID_ID');

    const doctor = await this.doctorModel
      .findOne({ authAccountId: new Types.ObjectId(authAccountId) })
      .lean();

    if (!doctor) throw new NotFoundException('doctor.NOT_FOUND');
    return doctor;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PERIOD BOUNDS HELPER
  // ═══════════════════════════════════════════════════════════════════════════

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

  private getMonthRange(offset: 0 | -1): [Date, Date] {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const end = new Date(
      now.getFullYear(),
      now.getMonth() + offset + 1,
      0,
      23,
      59,
      59,
      999,
    );
    return [start, end];
  }

  private buildStat(current: number, previous: number): MonthlyStatDto {
    const changePercent =
      previous === 0
        ? current > 0
          ? 100
          : 0 // avoid division by zero
        : parseFloat((((current - previous) / previous) * 100).toFixed(2));

    return {
      percentage: parseFloat(current.toFixed(2)),
      changePercent: Math.abs(changePercent),
      isIncrease: changePercent >= 0,
    };
  }

  // ─── Main ───────────────────────────────────────────────────────────────────

  async getDoctorStats(doctorId: string): Promise<DoctorStatsResponseDto> {
    const doctorObjectId = new Types.ObjectId(doctorId);
    const doctor = await this.doctorModel.findOne(doctorObjectId);
    if (!doctor) {
      throw new NotFoundException(`Doctor not found`);
    }
    const [curStart, curEnd] = this.getMonthRange(0);
    const [prevStart, prevEnd] = this.getMonthRange(-1);
    const [answeredRate, rejectedPostsRate, approvedPostsRate] =
      await Promise.all([
        this.calcAnsweredQuestionsRate(
          doctor.authAccountId,
          curStart,
          curEnd,
          prevStart,
          prevEnd,
        ),
        this.calcPostStatusRate(
          doctor.authAccountId,
          'rejected',
          curStart,
          curEnd,
          prevStart,
          prevEnd,
        ),
        this.calcPostStatusRate(
          doctor.authAccountId,
          'approved',
          curStart,
          curEnd,
          prevStart,
          prevEnd,
        ),
      ]);

    return {
      data: {
        stats: {
          answeredQuestionsRate: answeredRate,
          rejectedPostsRate,
          approvedPostsRate,
        },
      },
    };
  }

  // ─── Answered Questions Rate ────────────────────────────────────────────────

  /**
   * % = (questions where doctor gave ≥1 answer) / (total questions in period) * 100
   * We join questions with answers by the doctor to count doctor-answered ones.
   */
  private async calcAnsweredQuestionsRate(
    doctorId: Types.ObjectId,
    curStart: Date,
    curEnd: Date,
    prevStart: Date,
    prevEnd: Date,
  ): Promise<MonthlyStatDto> {
    const calcForPeriod = async (start: Date, end: Date): Promise<number> => {
      const [result] = await this.questionModel.aggregate([
        // All questions in the period (not deleted)
        {
          $match: {
            createdAt: { $gte: start, $lte: end },
            status: { $ne: 'deleted' },
          },
        },
        {
          $lookup: {
            from: 'answers',
            let: { qId: '$_id' },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ['$questionId', '$$qId'] },
                      { $eq: ['$responderId', doctorId] },
                      { $ne: ['$status', 'deleted'] },
                    ],
                  },
                },
              },
              { $limit: 1 },
            ],
            as: 'doctorAnswers',
          },
        },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            answered: {
              $sum: {
                $cond: [{ $gt: [{ $size: '$doctorAnswers' }, 0] }, 1, 0],
              },
            },
          },
        },
        {
          $project: {
            _id: 0,
            rate: {
              $cond: [
                { $eq: ['$total', 0] },
                0,
                { $multiply: [{ $divide: ['$answered', '$total'] }, 100] },
              ],
            },
          },
        },
      ]);

      return result?.rate ?? 0;
    };

    const [current, previous] = await Promise.all([
      calcForPeriod(curStart, curEnd),
      calcForPeriod(prevStart, prevEnd),
    ]);

    return this.buildStat(current, previous);
  }

  // ─── Post Status Rate ───────────────────────────────────────────────────────

  /**
   * % = (doctor posts with given status) / (all doctor posts in period) * 100
   */
  private async calcPostStatusRate(
    doctorId: Types.ObjectId,
    status: 'approved' | 'rejected',
    curStart: Date,
    curEnd: Date,
    prevStart: Date,
    prevEnd: Date,
  ): Promise<MonthlyStatDto> {
    const calcForPeriod = async (start: Date, end: Date): Promise<number> => {
      const [result] = await this.postModel.aggregate([
        {
          $match: {
            authorId: doctorId,
            authorType: UserRole.DOCTOR,
            createdAt: { $gte: start, $lte: end },
            status: { $ne: 'deleted' },
          },
        },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            matched: { $sum: { $cond: [{ $eq: ['$status', status] }, 1, 0] } },
          },
        },
        {
          $project: {
            _id: 0,
            rate: {
              $cond: [
                { $eq: ['$total', 0] },
                0,
                { $multiply: [{ $divide: ['$matched', '$total'] }, 100] },
              ],
            },
          },
        },
      ]);

      return result?.rate ?? 0;
    };

    const [current, previous] = await Promise.all([
      calcForPeriod(curStart, curEnd),
      calcForPeriod(prevStart, prevEnd),
    ]);

    return this.buildStat(current, previous);
  }
}
