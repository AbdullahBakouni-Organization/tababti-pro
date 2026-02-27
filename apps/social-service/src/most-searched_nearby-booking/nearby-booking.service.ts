import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Types } from 'mongoose';

import { BookingStatus } from '@app/common/database/schemas/common.enums';
import { NearbyBookingRepository } from './nearby-booking.repository';
import { GetDoctorPatientsDto } from './dto/get-doctor-patients.dto';
import { GetMyAppointmentsDto } from './dto/get-my-appointments.dto';
import { SearchPatientsDto } from './dto/search-patients.dto';

@Injectable()
export class NearbyBookingService {
  constructor(private readonly repo: NearbyBookingRepository) {}

  // ── Get Next Booking For User ─────────────────────────────────────────────

  async getNextBookingForUser(authAccountId: string, doctorId?: string) {
    this.assertValidObjectId(authAccountId);

    const user = await this.repo.findUserByAuthAccountId(authAccountId);
    if (!user) throw new NotFoundException('user.NOT_FOUND');

    if (doctorId) this.assertValidObjectId(doctorId);

    const booking = await this.repo.findNextBookingForUser(
      user._id as Types.ObjectId,
      doctorId,
    );

    if (!booking) throw new NotFoundException('booking.NOT_FOUND_USER');
    return booking;
  }

  // ── Get Next Booking For Doctor ───────────────────────────────────────────

  async getNextBookingForDoctor(authAccountId: string) {
    this.assertValidObjectId(authAccountId);

    const doctor = await this.repo.findDoctorByAuthAccountId(authAccountId);
    if (!doctor) throw new NotFoundException('doctor.NOT_FOUND');

    const booking = await this.repo.findNextBookingForDoctor(
      doctor._id as Types.ObjectId,
    );

    if (!booking) throw new NotFoundException('booking.NOT_FOUND_DOCTOR');
    return booking;
  }

  // ── Get Top Doctors ───────────────────────────────────────────────────────

  async getTopDoctors(limit = 10) {
    const safeLimit = Math.min(Math.max(limit, 1), 50);
    return this.repo.findTopDoctors(safeLimit);
  }

  // ── Get All Bookings For User ─────────────────────────────────────────────

  async getAllBookingsForUser(authAccountId: string, status?: string) {
    this.assertValidObjectId(authAccountId);

    const user = await this.repo.findUserByAuthAccountId(authAccountId);
    if (!user) throw new NotFoundException('user.NOT_FOUND');

    if (
      status &&
      !Object.values(BookingStatus).includes(status as BookingStatus)
    ) {
      throw new BadRequestException('booking.INVALID_STATUS');
    }

    return this.repo.findAllBookingsForUser(user._id as Types.ObjectId, status);
  }

  // ── Get Doctor Patients ───────────────────────────────────────────────────

  async getDoctorPatients(
    authAccountId: string,
    filters: GetDoctorPatientsDto,
  ) {
    this.assertValidObjectId(authAccountId);

    const doctor = await this.repo.findDoctorByAuthAccountId(authAccountId);
    if (!doctor) throw new NotFoundException('doctor.NOT_FOUND');

    return this.repo.findDoctorPatients(doctor._id as Types.ObjectId, filters);
  }

  // ── Get My Appointments (Doctor) ──────────────────────────────────────────

  async getMyAppointments(
    authAccountId: string,
    filters: GetMyAppointmentsDto,
  ) {
    this.assertValidObjectId(authAccountId);

    const doctor = await this.repo.findDoctorByAuthAccountId(authAccountId);
    if (!doctor) throw new NotFoundException('doctor.NOT_FOUND');

    return this.repo.findMyAppointments(doctor._id as Types.ObjectId, filters);
  }

  // ── Private Helpers ───────────────────────────────────────────────────────

  private assertValidObjectId(id: string): void {
    if (!Types.ObjectId.isValid(id))
      throw new BadRequestException('common.VALIDATION_ERROR');
  }

  // add to nearby-booking.service.ts

  async searchDoctorPatients(
    authAccountId: string,
    filters: SearchPatientsDto,
  ) {
    this.assertValidObjectId(authAccountId);

    const doctor = await this.repo.findDoctorByAuthAccountId(authAccountId);
    if (!doctor) throw new NotFoundException('doctor.NOT_FOUND');

    return this.repo.searchDoctorPatients(
      doctor._id as Types.ObjectId,
      filters,
    );
  }
}
