import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Types } from 'mongoose';

import { BookingStatus } from '@app/common/database/schemas/common.enums';
import { CacheService } from '@app/common/cache/cache.service';
import { NearbyBookingRepository } from './nearby-booking.repository';
import { GetDoctorPatientsDto } from './dto/get-doctor-patients.dto';
import { GetMyAppointmentsDto } from './dto/get-my-appointments.dto';
import { SearchPatientsDto } from './dto/search-patients.dto';
import { PatientDetailDto } from './dto/patient.detail.dto';

// ── Cache TTL constants (seconds) ─────────────────────────────────────────────
const TTL = {
  TOP_DOCTORS: { memory: 300, redis: 7200 },
  NEXT_BOOKING: { memory: 30, redis: 7200 },
  ALL_BOOKINGS: { memory: 60, redis: 300 },
  PATIENTS: { memory: 60, redis: 300 },
  APPOINTMENTS: { memory: 30, redis: 120 },
  PATIENT_DETAIL: { memory: 60, redis: 300 },
} as const;

// ── Cache key builders ────────────────────────────────────────────────────────
const CK = {
  topDoctors: (page: number, limit: number) =>
    `booking:top-doctors:${page}:${limit}`,
  nextUser: (userId: string, page: number, limit: number, doctorId = 'any') =>
    `booking:next-user:${userId}:${doctorId}:${page}:${limit}`,
  nextDoctor: (doctorId: string, page: number, limit: number) =>
    `booking:next-doctor:${doctorId}:${page}:${limit}`,
  allBookings: (userId: string, status = 'all', page: number, limit: number) =>
    `booking:all:${userId}:${status}:${page}:${limit}`,
  patients: (doctorId: string, q: string) =>
    `booking:patients:${doctorId}:${q}`,
  appointments: (doctorId: string, q: string) =>
    `booking:appointments:${doctorId}:${q}`,
  searchPatients: (doctorId: string, q: string) =>
    `booking:search-patients:${doctorId}:${q}`,
  patientDetail: (doctorId: string, patientId: string, q: string) =>
    `booking:patient-detail:${doctorId}:${patientId}:${q}`,

  // invalidation patterns
  patternTopDoctors: () => `booking:top-doctors:*`,
  patternNextUser: (userId: string) => `booking:next-user:${userId}:*`,
  patternNextDoctor: (doctorId: string) => `booking:next-doctor:${doctorId}:*`,
  patternAllBookings: (userId: string) => `booking:all:${userId}:*`,
  patternPatients: (doctorId: string) => `booking:patients:${doctorId}:*`,
  patternAppointments: (doctorId: string) =>
    `booking:appointments:${doctorId}:*`,
  patternSearchPatients: (doctorId: string) =>
    `booking:search-patients:${doctorId}:*`,
  patternPatientDetail: (doctorId: string) =>
    `booking:patient-detail:${doctorId}:*`,
};

function fromCache<T>(value: any): T | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  }
  return value as T;
}

function safePage(p: any): number {
  return Math.max(Number(p) || 1, 1);
}
function safeLimit(l: any): number {
  return Math.min(Math.max(Number(l) || 10, 1), 50);
}

@Injectable()
export class NearbyBookingService {
  constructor(
    private readonly repo: NearbyBookingRepository,
    private readonly cache: CacheService,
  ) {}

  // ── Top Doctors ───────────────────────────────────────────────────────────
  async getTopDoctors(page = 1, limit = 10) {
    const p = safePage(page),
      l = safeLimit(limit);
    const key = CK.topDoctors(p, l);
    const cached = fromCache(await this.cache.get(key));
    if (cached) return cached;
    const data = await this.repo.findTopDoctors(p, l);
    await this.cache.set(key, data, 120, TTL.TOP_DOCTORS.redis);
    return data;
  }

  // ── Next Booking For User ─────────────────────────────────────────────────
  async getNextBookingForUser(
    authAccountId: string,
    page = 1,
    limit = 10,
    doctorId?: string,
  ) {
    this.assertObjectId(authAccountId);
    if (doctorId) this.assertObjectId(doctorId);
    const user = await this.repo.findUserByAuthAccountId(authAccountId);
    if (!user) throw new NotFoundException('user.NOT_FOUND');
    const data = await this.repo.findNextBookingsForUser(user._id, doctorId);
    return data;
  }

  // ── Next Booking For Doctor ───────────────────────────────────────────────
  async getNextBookingForDoctor(authAccountId: string, page = 1, limit = 10) {
    this.assertObjectId(authAccountId);
    const doctor = await this.repo.findDoctorByAuthAccountId(authAccountId);
    if (!doctor) throw new NotFoundException('doctor.NOT_FOUND');
    const p = safePage(page),
      l = safeLimit(limit);
    const doctorId = doctor._id.toString();
    const key = CK.nextDoctor(doctorId, p, l);
    const cached = fromCache(await this.cache.get(key));
    if (cached) return cached;
    const data = await this.repo.findNextBookingsForDoctor(doctor._id, p, l);
    await this.cache.set(
      key,
      data,
      TTL.NEXT_BOOKING.memory,
      TTL.NEXT_BOOKING.redis,
    );
    return data;
  }

  // ── All Bookings For User ─────────────────────────────────────────────────
  async getAllBookingsForUser(
    authAccountId: string,
    status?: string,
    page = 1,
    limit = 10,
  ) {
    this.assertObjectId(authAccountId);
    const user = await this.repo.findUserByAuthAccountId(authAccountId);
    if (!user) throw new NotFoundException('user.NOT_FOUND');
    if (
      status &&
      !Object.values(BookingStatus).includes(status as BookingStatus)
    )
      throw new BadRequestException('booking.INVALID_STATUS');
    const p = safePage(page),
      l = safeLimit(limit);
    const userId = user._id.toString();
    const key = CK.allBookings(userId, status, p, l);
    const cached = fromCache(await this.cache.get(key));
    if (cached) return cached;
    const data = await this.repo.findAllBookingsForUser(user._id, status, p, l);
    await this.cache.set(
      key,
      data,
      TTL.ALL_BOOKINGS.memory,
      TTL.ALL_BOOKINGS.redis,
    );
    return data;
  }

  // ── Doctor Patients ───────────────────────────────────────────────────────
  async getDoctorPatients(
    authAccountId: string,
    filters: GetDoctorPatientsDto,
  ) {
    this.assertObjectId(authAccountId);
    const doctor = await this.repo.findDoctorByAuthAccountId(authAccountId);
    if (!doctor) throw new NotFoundException('doctor.NOT_FOUND');
    const data = await this.repo.findDoctorPatients(doctor._id, filters);
    return data;
  }

  // ── My Appointments ───────────────────────────────────────────────────────
  async getMyAppointments(
    authAccountId: string,
    filters: GetMyAppointmentsDto,
  ) {
    this.assertObjectId(authAccountId);
    const doctor = await this.repo.findDoctorByAuthAccountId(authAccountId);
    if (!doctor) throw new NotFoundException('doctor.NOT_FOUND');
    const p = safePage(filters.page),
      l = safeLimit(filters.limit);
    const doctorId = doctor._id.toString();
    const key = CK.appointments(
      doctorId,
      this.serializeFilters({ ...filters, page: p, limit: l }),
    );
    const cached = fromCache(await this.cache.get(key));
    if (cached) return cached;
    const data = await this.repo.findMyAppointments(doctor._id, filters);
    await this.cache.set(
      key,
      data,
      TTL.APPOINTMENTS.memory,
      TTL.APPOINTMENTS.redis,
    );
    return data;
  }

  // ── Search Patients V2 (with filters + stats) ─────────────────────────────
  async searchDoctorPatientsV2(
    authAccountId: string,
    filters: SearchPatientsDto,
  ) {
    this.assertObjectId(authAccountId);
    const doctor = await this.repo.findDoctorByAuthAccountId(authAccountId);
    if (!doctor) throw new NotFoundException('doctor.NOT_FOUND');
    const p = safePage(filters.page),
      l = safeLimit(filters.limit);
    const data = await this.repo.searchDoctorPatientsV2(doctor._id, {
      ...filters,
      page: p,
      limit: l,
    });
    return data;
  }

  // ── Patient Detail ────────────────────────────────────────────────────────
  async getPatientDetail(authAccountId: string, dto: PatientDetailDto) {
    this.assertObjectId(authAccountId);
    this.assertObjectId(dto.patientId);
    const doctor = await this.repo.findDoctorByAuthAccountId(authAccountId);
    if (!doctor) throw new NotFoundException('doctor.NOT_FOUND');
    const doctorId = doctor._id.toString();
    const key = CK.patientDetail(
      doctorId,
      dto.patientId,
      this.serializeFilters({
        status: dto.status,
        page: dto.page,
        limit: dto.limit,
      }),
    );
    const _cached = fromCache(await this.cache.get(key));
    // if (cached) return cached;
    const data = await this.repo.getPatientDetail(doctor._id, dto);
    if (!data) throw new NotFoundException('user.NOT_FOUND');
    await this.cache.set(
      key,
      data,
      TTL.PATIENT_DETAIL.memory,
      TTL.PATIENT_DETAIL.redis,
    );
    return data;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Cache Invalidation
  // ══════════════════════════════════════════════════════════════════════════
  async onDoctorSearched(): Promise<void> {
    await this.cache.invalidatePattern(CK.patternTopDoctors());
  }

  async onBookingCreated(userId: string, doctorId: string): Promise<void> {
    await Promise.all([
      this.cache.invalidatePattern(CK.patternNextUser(userId)),
      this.cache.invalidatePattern(CK.patternNextDoctor(doctorId)),
      this.cache.invalidatePattern(CK.patternAllBookings(userId)),
      this.cache.invalidatePattern(CK.patternAppointments(doctorId)),
    ]);
  }

  async onBookingCancelled(userId: string, doctorId: string): Promise<void> {
    await Promise.all([
      this.cache.invalidatePattern(CK.patternNextUser(userId)),
      this.cache.invalidatePattern(CK.patternNextDoctor(doctorId)),
      this.cache.invalidatePattern(CK.patternAllBookings(userId)),
      this.cache.invalidatePattern(CK.patternAppointments(doctorId)),
      this.cache.invalidatePattern(CK.patternSearchPatients(doctorId)),
      this.cache.invalidatePattern(CK.patternPatientDetail(doctorId)),
    ]);
  }

  async onBookingConfirmed(userId: string, doctorId: string): Promise<void> {
    await Promise.all([
      this.cache.invalidatePattern(CK.patternNextUser(userId)),
      this.cache.invalidatePattern(CK.patternNextDoctor(doctorId)),
      this.cache.invalidatePattern(CK.patternAppointments(doctorId)),
    ]);
  }

  async onBookingCompleted(userId: string, doctorId: string): Promise<void> {
    await Promise.all([
      this.cache.invalidatePattern(CK.patternNextUser(userId)),
      this.cache.invalidatePattern(CK.patternNextDoctor(doctorId)),
      this.cache.invalidatePattern(CK.patternAllBookings(userId)),
      this.cache.invalidatePattern(CK.patternPatients(doctorId)),
      this.cache.invalidatePattern(CK.patternAppointments(doctorId)),
      this.cache.invalidatePattern(CK.patternSearchPatients(doctorId)),
      this.cache.invalidatePattern(CK.patternPatientDetail(doctorId)),
    ]);
  }

  async onBookingRescheduled(userId: string, doctorId: string): Promise<void> {
    await Promise.all([
      this.cache.invalidatePattern(CK.patternNextUser(userId)),
      this.cache.invalidatePattern(CK.patternNextDoctor(doctorId)),
      this.cache.invalidatePattern(CK.patternAllBookings(userId)),
      this.cache.invalidatePattern(CK.patternAppointments(doctorId)),
      this.cache.invalidatePattern(CK.patternSearchPatients(doctorId)),
      this.cache.invalidatePattern(CK.patternPatientDetail(doctorId)),
    ]);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  private assertObjectId(id: string): void {
    if (!Types.ObjectId.isValid(id))
      throw new BadRequestException('common.INVALID_ID');
  }

  private serializeFilters(filters: Record<string, any>): string {
    return Object.keys(filters)
      .sort()
      .filter(
        (k) =>
          filters[k] !== undefined && filters[k] !== null && filters[k] !== '',
      )
      .map((k) => `${k}=${filters[k]}`)
      .join('&');
  }
}
