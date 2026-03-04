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

// ── Cache TTL constants (seconds) ─────────────────────────────────────────────
const TTL = {
  TOP_DOCTORS: { memory: 300, redis: 3600 },    // 5 min memory | 1 hr redis  (public, slow-changing)
  NEXT_BOOKING: { memory: 30, redis: 120 },   // 30 s memory  | 2 min redis (real-time feel)
  ALL_BOOKINGS: { memory: 60, redis: 300 },   // 1 min memory | 5 min redis
  PATIENTS: { memory: 60, redis: 300 },   // 1 min memory | 5 min redis
  APPOINTMENTS: { memory: 30, redis: 120 },   // 30 s memory  | 2 min redis
} as const;

// ── Cache key builders ────────────────────────────────────────────────────────
const CK = {
  topDoctors: (page: number, limit: number) => `booking:top-doctors:${page}:${limit}`,
  nextUser: (userId: string, doctorId = 'any') => `booking:next-user:${userId}:${doctorId}`,
  nextDoctor: (doctorId: string) => `booking:next-doctor:${doctorId}`,
  allBookings: (userId: string, status = 'all') => `booking:all:${userId}:${status}`,
  patients: (doctorId: string, q: string) => `booking:patients:${doctorId}:${q}`,
  appointments: (doctorId: string, q: string) => `booking:appointments:${doctorId}:${q}`,
  searchPatients: (doctorId: string, q: string) => `booking:search-patients:${doctorId}:${q}`,

  // Invalidation patterns
  patternUser: (userId: string) => `booking:*:${userId}:*`,
  patternDoctor: (doctorId: string) => `booking:*:${doctorId}:*`,
  patternTopDoctors: () => `booking:top-doctors:*`,
};

@Injectable()
export class NearbyBookingService {
  constructor(
    private readonly repo: NearbyBookingRepository,
    private readonly cache: CacheService,
  ) { }

  // ── Get Next Booking For User ─────────────────────────────────────────────

  async getNextBookingForUser(authAccountId: string, doctorId?: string) {
    this.assertValidObjectId(authAccountId);
    if (doctorId) this.assertValidObjectId(doctorId);

    const user = await this.repo.findUserByAuthAccountId(authAccountId);
    if (!user) throw new NotFoundException('user.NOT_FOUND');

    const userId = (user._id as Types.ObjectId).toString();
    const cacheKey = CK.nextUser(userId, doctorId);

    const cached = await this.cache.get(cacheKey);
    if (cached) { console.log(`[CACHE HIT]  ${cacheKey}`); return cached; }
    console.log(`[CACHE MISS] ${cacheKey}`);

    const booking = await this.repo.findNextBookingForUser(
      user._id as Types.ObjectId,
      doctorId,
    );
    if (!booking) throw new NotFoundException('booking.NOT_FOUND_USER');

    await this.cache.set(cacheKey, booking, TTL.NEXT_BOOKING.memory, TTL.NEXT_BOOKING.redis);
    return booking;
  }

  // ── Get Next Booking For Doctor ───────────────────────────────────────────

  async getNextBookingForDoctor(authAccountId: string) {
    this.assertValidObjectId(authAccountId);

    const doctor = await this.repo.findDoctorByAuthAccountId(authAccountId);
    if (!doctor) throw new NotFoundException('doctor.NOT_FOUND');

    const doctorId = (doctor._id as Types.ObjectId).toString();
    const cacheKey = CK.nextDoctor(doctorId);

    const cached = await this.cache.get(cacheKey);
    if (cached) { console.log(`[CACHE HIT]  ${cacheKey}`); return cached; }
    console.log(`[CACHE MISS] ${cacheKey}`);

    const booking = await this.repo.findNextBookingForDoctor(
      doctor._id as Types.ObjectId,
    );
    if (!booking) throw new NotFoundException('booking.NOT_FOUND_DOCTOR');

    await this.cache.set(cacheKey, booking, TTL.NEXT_BOOKING.memory, TTL.NEXT_BOOKING.redis);
    return booking;
  }

  // ── Get Top Doctors ───────────────────────────────────────────────────────

  async getTopDoctors(page = 1, limit = 10) {
    const cacheKey = CK.topDoctors(page, limit);

    const cached = await this.cache.get(cacheKey);
    if (cached) {
      console.log(`[CACHE HIT]  ${cacheKey}`);
      return typeof cached === 'string' ? JSON.parse(cached) : cached;
    }
    console.log(`[CACHE MISS] ${cacheKey}`);

    const data = await this.repo.findTopDoctors(page, limit);
    await this.cache.set(cacheKey, data, TTL.TOP_DOCTORS.memory, TTL.TOP_DOCTORS.redis);
    return data;
  }

  // ── Get All Bookings For User ─────────────────────────────────────────────

  async getAllBookingsForUser(authAccountId: string, status?: string) {
    this.assertValidObjectId(authAccountId);

    const user = await this.repo.findUserByAuthAccountId(authAccountId);
    if (!user) throw new NotFoundException('user.NOT_FOUND');

    if (status && !Object.values(BookingStatus).includes(status as BookingStatus)) {
      throw new BadRequestException('booking.INVALID_STATUS');
    }

    const userId = (user._id as Types.ObjectId).toString();
    const cacheKey = CK.allBookings(userId, status);

    const cached = await this.cache.get(cacheKey);
    if (cached) { console.log(`[CACHE HIT]  ${cacheKey}`); return cached; }
    console.log(`[CACHE MISS] ${cacheKey}`);

    const bookings = await this.repo.findAllBookingsForUser(
      user._id as Types.ObjectId,
      status,
    );

    await this.cache.set(cacheKey, bookings, TTL.ALL_BOOKINGS.memory, TTL.ALL_BOOKINGS.redis);
    return bookings;
  }

  // ── Get Doctor Patients ───────────────────────────────────────────────────

  async getDoctorPatients(authAccountId: string, filters: GetDoctorPatientsDto) {
    this.assertValidObjectId(authAccountId);

    const doctor = await this.repo.findDoctorByAuthAccountId(authAccountId);
    if (!doctor) throw new NotFoundException('doctor.NOT_FOUND');

    const doctorId = (doctor._id as Types.ObjectId).toString();
    const cacheKey = CK.patients(doctorId, this.serializeFilters(filters));

    const cached = await this.cache.get(cacheKey);
    if (cached) { console.log(`[CACHE HIT]  ${cacheKey}`); return cached; }
    console.log(`[CACHE MISS] ${cacheKey}`);

    const data = await this.repo.findDoctorPatients(
      doctor._id as Types.ObjectId,
      filters,
    );

    await this.cache.set(cacheKey, data, TTL.PATIENTS.memory, TTL.PATIENTS.redis);
    return data;
  }

  // ── Get My Appointments (Doctor) ──────────────────────────────────────────

  async getMyAppointments(authAccountId: string, filters: GetMyAppointmentsDto) {
    this.assertValidObjectId(authAccountId);

    const doctor = await this.repo.findDoctorByAuthAccountId(authAccountId);
    if (!doctor) throw new NotFoundException('doctor.NOT_FOUND');

    const doctorId = (doctor._id as Types.ObjectId).toString();
    const cacheKey = CK.appointments(doctorId, this.serializeFilters(filters));

    const cached = await this.cache.get(cacheKey);
    if (cached) { console.log(`[CACHE HIT]  ${cacheKey}`); return cached; }
    console.log(`[CACHE MISS] ${cacheKey}`);

    const data = await this.repo.findMyAppointments(
      doctor._id as Types.ObjectId,
      filters,
    );

    await this.cache.set(cacheKey, data, TTL.APPOINTMENTS.memory, TTL.APPOINTMENTS.redis);
    return data;
  }

  // ── Search Doctor Patients ────────────────────────────────────────────────

  async searchDoctorPatients(
    authAccountId: string,
    search: string,
    page: number,
    limit: number,
  ) {
    this.assertValidObjectId(authAccountId);

    const doctor = await this.repo.findDoctorByAuthAccountId(authAccountId);
    if (!doctor) throw new NotFoundException('doctor.NOT_FOUND');

    const doctorId = (doctor._id as Types.ObjectId).toString();
    const cacheKey = CK.searchPatients(doctorId, `search=${search ?? ''}&page=${page}&limit=${limit}`);

    const cached = await this.cache.get(cacheKey);
    if (cached) { console.log(`[CACHE HIT]  ${cacheKey}`); return cached; }
    console.log(`[CACHE MISS] ${cacheKey}`);

    const data = await this.repo.searchDoctorPatients(
      doctor._id as Types.ObjectId,
      search,
      page,
      limit,
    );

    await this.cache.set(cacheKey, data, TTL.PATIENTS.memory, TTL.PATIENTS.redis);
    return data;
  }

  // ── Cache Invalidation (call from booking mutation services) ──────────────

  /**
   * Invalidate all caches tied to a specific user (e.g. after booking created/cancelled).
   * Pass the internal user._id (not authAccountId).
   */
  async invalidateUserCache(userId: string): Promise<void> {
    await this.cache.invalidatePattern(CK.patternUser(userId));
  }

  /**
   * Invalidate all caches tied to a specific doctor (e.g. after booking status change).
   * Pass the internal doctor._id (not authAccountId).
   */
  async invalidateDoctorCache(doctorId: string): Promise<void> {
    await this.cache.invalidatePattern(CK.patternDoctor(doctorId));
  }

  /**
   * Invalidate top-doctors list (e.g. after searchCount is incremented).
   */
  async invalidateTopDoctors(): Promise<void> {
    await this.cache.invalidatePattern(CK.patternTopDoctors());
  }

  // ── Private Helpers ───────────────────────────────────────────────────────

  private assertValidObjectId(id: string): void {
    if (!Types.ObjectId.isValid(id))
      throw new BadRequestException('common.VALIDATION_ERROR');
  }

  /**
   * Produces a stable, compact string from a filters DTO to use as a cache key segment.
   * Sorts keys so that { page:1, limit:10 } and { limit:10, page:1 } produce the same key.
   */
  private serializeFilters(filters: Record<string, any>): string {
    return Object.keys(filters)
      .sort()
      .filter((k) => filters[k] !== undefined && filters[k] !== null && filters[k] !== '')
      .map((k) => `${k}=${filters[k]}`)
      .join('&');
  }
}