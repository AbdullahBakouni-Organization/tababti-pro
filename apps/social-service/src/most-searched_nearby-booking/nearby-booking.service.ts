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

// ── Cache TTL constants (seconds) ─────────────────────────────────────────────
const TTL = {
  TOP_DOCTORS: { memory: 300, redis: 3600 },
  NEXT_BOOKING: { memory: 30, redis: 120 },
  ALL_BOOKINGS: { memory: 60, redis: 300 },
  PATIENTS: { memory: 60, redis: 300 },
  APPOINTMENTS: { memory: 30, redis: 120 },
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

  // Patterns for invalidation
  patternTopDoctors: () => `booking:top-doctors:*`,
  patternNextUser: (userId: string) => `booking:next-user:${userId}:*`,
  patternNextDoctor: (doctorId: string) => `booking:next-doctor:${doctorId}:*`,
  patternAllBookings: (userId: string) => `booking:all:${userId}:*`,
  patternPatients: (doctorId: string) => `booking:patients:${doctorId}:*`,
  patternAppointments: (doctorId: string) =>
    `booking:appointments:${doctorId}:*`,
  patternSearchPatients: (doctorId: string) =>
    `booking:search-patients:${doctorId}:*`,
};

// ── Safe cache deserializer ───────────────────────────────────────────────────
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

// ── Pagination helpers ────────────────────────────────────────────────────────
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

  // ── READ: Get Top Doctors (paginated) ─────────────────────────────────────

  async getTopDoctors(page = 1, limit = 10) {
    const p = safePage(page);
    const l = safeLimit(limit);
    const cacheKey = CK.topDoctors(p, l);

    const cached = fromCache(await this.cache.get(cacheKey));
    if (cached) {
      console.log(`[CACHE HIT]  ${cacheKey}`);
      return cached;
    }
    console.log(`[CACHE MISS] ${cacheKey}`);

    const data = await this.repo.findTopDoctors(p, l);
    await this.cache.set(
      cacheKey,
      data,
      TTL.TOP_DOCTORS.memory,
      TTL.TOP_DOCTORS.redis,
    );
    return data;
  }

  // ── READ: Get Upcoming Bookings For User (paginated) ──────────────────────

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

    const p = safePage(page);
    const l = safeLimit(limit);
    const userId = (user._id as Types.ObjectId).toString();
    const cacheKey = CK.nextUser(userId, p, l, doctorId);

    const cached = fromCache(await this.cache.get(cacheKey));
    if (cached) {
      console.log(`[CACHE HIT]  ${cacheKey}`);
      return cached;
    }
    console.log(`[CACHE MISS] ${cacheKey}`);

    const data = await this.repo.findNextBookingsForUser(
      user._id as Types.ObjectId,
      p,
      l,
      doctorId,
    );
    await this.cache.set(
      cacheKey,
      data,
      TTL.NEXT_BOOKING.memory,
      TTL.NEXT_BOOKING.redis,
    );
    return data;
  }

  // ── READ: Get Upcoming Bookings For Doctor (paginated) ────────────────────

  async getNextBookingForDoctor(authAccountId: string, page = 1, limit = 10) {
    this.assertObjectId(authAccountId);

    const doctor = await this.repo.findDoctorByAuthAccountId(authAccountId);
    if (!doctor) throw new NotFoundException('doctor.NOT_FOUND');

    const p = safePage(page);
    const l = safeLimit(limit);
    const doctorId = (doctor._id as Types.ObjectId).toString();
    const cacheKey = CK.nextDoctor(doctorId, p, l);

    const cached = fromCache(await this.cache.get(cacheKey));
    if (cached) {
      console.log(`[CACHE HIT]  ${cacheKey}`);
      return cached;
    }
    console.log(`[CACHE MISS] ${cacheKey}`);

    const data = await this.repo.findNextBookingsForDoctor(
      doctor._id as Types.ObjectId,
      p,
      l,
    );
    await this.cache.set(
      cacheKey,
      data,
      TTL.NEXT_BOOKING.memory,
      TTL.NEXT_BOOKING.redis,
    );
    return data;
  }

  // ── READ: Get All Bookings For User (paginated) ───────────────────────────

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
    ) {
      throw new BadRequestException('booking.INVALID_STATUS');
    }

    const p = safePage(page);
    const l = safeLimit(limit);
    const userId = (user._id as Types.ObjectId).toString();
    const cacheKey = CK.allBookings(userId, status, p, l);

    const cached = fromCache(await this.cache.get(cacheKey));
    if (cached) {
      console.log(`[CACHE HIT]  ${cacheKey}`);
      return cached;
    }
    console.log(`[CACHE MISS] ${cacheKey}`);

    const bookings = await this.repo.findAllBookingsForUser(
      user._id as Types.ObjectId,
      status,
      p,
      l,
    );
    await this.cache.set(
      cacheKey,
      bookings,
      TTL.ALL_BOOKINGS.memory,
      TTL.ALL_BOOKINGS.redis,
    );
    return bookings;
  }

  // ── READ: Get Doctor Patients (paginated) ─────────────────────────────────

  async getDoctorPatients(
    authAccountId: string,
    filters: GetDoctorPatientsDto,
  ) {
    this.assertObjectId(authAccountId);

    const doctor = await this.repo.findDoctorByAuthAccountId(authAccountId);
    if (!doctor) throw new NotFoundException('doctor.NOT_FOUND');

    const p = safePage(filters.page);
    const l = safeLimit(filters.limit);
    const doctorId = (doctor._id as Types.ObjectId).toString();
    const cacheKey = CK.patients(
      doctorId,
      this.serializeFilters({ ...filters, page: p, limit: l }),
    );

    const cached = fromCache(await this.cache.get(cacheKey));
    if (cached) {
      console.log(`[CACHE HIT]  ${cacheKey}`);
      return cached;
    }
    console.log(`[CACHE MISS] ${cacheKey}`);

    const data = await this.repo.findDoctorPatients(
      doctor._id as Types.ObjectId,
      filters,
    );
    await this.cache.set(
      cacheKey,
      data,
      TTL.PATIENTS.memory,
      TTL.PATIENTS.redis,
    );
    return data;
  }

  // ── READ: Get My Appointments (paginated) ─────────────────────────────────

  async getMyAppointments(
    authAccountId: string,
    filters: GetMyAppointmentsDto,
  ) {
    this.assertObjectId(authAccountId);

    const doctor = await this.repo.findDoctorByAuthAccountId(authAccountId);
    if (!doctor) throw new NotFoundException('doctor.NOT_FOUND');

    const p = safePage(filters.page);
    const l = safeLimit(filters.limit);
    const doctorId = (doctor._id as Types.ObjectId).toString();
    const cacheKey = CK.appointments(
      doctorId,
      this.serializeFilters({ ...filters, page: p, limit: l }),
    );

    const cached = fromCache(await this.cache.get(cacheKey));
    if (cached) {
      console.log(`[CACHE HIT]  ${cacheKey}`);
      return cached;
    }
    console.log(`[CACHE MISS] ${cacheKey}`);

    const data = await this.repo.findMyAppointments(
      doctor._id as Types.ObjectId,
      filters,
    );
    await this.cache.set(
      cacheKey,
      data,
      TTL.APPOINTMENTS.memory,
      TTL.APPOINTMENTS.redis,
    );
    return data;
  }

  // ── READ: Search Doctor Patients (paginated) ──────────────────────────────

  async searchDoctorPatients(
    authAccountId: string,
    search: string,
    page: number,
    limit: number,
  ) {
    this.assertObjectId(authAccountId);

    const doctor = await this.repo.findDoctorByAuthAccountId(authAccountId);
    if (!doctor) throw new NotFoundException('doctor.NOT_FOUND');

    const p = safePage(page);
    const l = safeLimit(limit);
    const doctorId = (doctor._id as Types.ObjectId).toString();
    const cacheKey = CK.searchPatients(
      doctorId,
      `search=${search ?? ''}&page=${p}&limit=${l}`,
    );

    const cached = fromCache(await this.cache.get(cacheKey));
    if (cached) {
      console.log(`[CACHE HIT]  ${cacheKey}`);
      return cached;
    }
    console.log(`[CACHE MISS] ${cacheKey}`);

    const data = await this.repo.searchDoctorPatients(
      doctor._id as Types.ObjectId,
      search,
      p,
      l,
    );
    await this.cache.set(
      cacheKey,
      data,
      TTL.PATIENTS.memory,
      TTL.PATIENTS.redis,
    );
    return data;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CACHE INVALIDATION — called from other services when data changes
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Call when: doctor profile updated, searchCount incremented
   * Invalidates: top-doctors list (searchCount changed)
   */
  async onDoctorSearched(): Promise<void> {
    await this.cache.invalidatePattern(CK.patternTopDoctors());
  }

  /**
   * Call when: new booking CREATED
   * Invalidates:
   *   - next-user (user has a new upcoming booking)
   *   - next-doctor (doctor has a new upcoming booking)
   *   - all-bookings for user (list changed)
   *   - doctor appointments (list changed)
   */
  async onBookingCreated(userId: string, doctorId: string): Promise<void> {
    await Promise.all([
      this.cache.invalidatePattern(CK.patternNextUser(userId)),
      this.cache.invalidatePattern(CK.patternNextDoctor(doctorId)),
      this.cache.invalidatePattern(CK.patternAllBookings(userId)),
      this.cache.invalidatePattern(CK.patternAppointments(doctorId)),
    ]);
  }

  /**
   * Call when: booking CANCELLED (by user, doctor, or system)
   * Invalidates:
   *   - next-user (upcoming list changed)
   *   - next-doctor (upcoming list changed)
   *   - all-bookings for user (status changed)
   *   - doctor appointments (status changed)
   */
  async onBookingCancelled(userId: string, doctorId: string): Promise<void> {
    await Promise.all([
      this.cache.invalidatePattern(CK.patternNextUser(userId)),
      this.cache.invalidatePattern(CK.patternNextDoctor(doctorId)),
      this.cache.invalidatePattern(CK.patternAllBookings(userId)),
      this.cache.invalidatePattern(CK.patternAppointments(doctorId)),
    ]);
  }

  /**
   * Call when: booking status → CONFIRMED
   * Invalidates:
   *   - next-user (status changed from PENDING to CONFIRMED)
   *   - next-doctor (status changed)
   *   - doctor appointments
   */
  async onBookingConfirmed(userId: string, doctorId: string): Promise<void> {
    await Promise.all([
      this.cache.invalidatePattern(CK.patternNextUser(userId)),
      this.cache.invalidatePattern(CK.patternNextDoctor(doctorId)),
      this.cache.invalidatePattern(CK.patternAppointments(doctorId)),
    ]);
  }

  /**
   * Call when: booking status → COMPLETED
   * Invalidates:
   *   - next-user (booking no longer upcoming)
   *   - next-doctor (booking no longer upcoming)
   *   - all-bookings for user (status changed)
   *   - doctor patients (new completed visit added)
   *   - doctor appointments (status changed)
   *   - search-patients (totalVisits changed)
   */
  async onBookingCompleted(userId: string, doctorId: string): Promise<void> {
    await Promise.all([
      this.cache.invalidatePattern(CK.patternNextUser(userId)),
      this.cache.invalidatePattern(CK.patternNextDoctor(doctorId)),
      this.cache.invalidatePattern(CK.patternAllBookings(userId)),
      this.cache.invalidatePattern(CK.patternPatients(doctorId)),
      this.cache.invalidatePattern(CK.patternAppointments(doctorId)),
      this.cache.invalidatePattern(CK.patternSearchPatients(doctorId)),
    ]);
  }

  /**
   * Call when: booking rescheduled (date/time changed)
   * Same as cancel + create combined
   */
  async onBookingRescheduled(userId: string, doctorId: string): Promise<void> {
    await Promise.all([
      this.cache.invalidatePattern(CK.patternNextUser(userId)),
      this.cache.invalidatePattern(CK.patternNextDoctor(doctorId)),
      this.cache.invalidatePattern(CK.patternAllBookings(userId)),
      this.cache.invalidatePattern(CK.patternAppointments(doctorId)),
    ]);
  }

  // ── Private Helpers ───────────────────────────────────────────────────────

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
