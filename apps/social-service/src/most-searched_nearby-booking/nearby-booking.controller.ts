import { Controller, Get, Query, UseGuards, Headers } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { NearbyBookingService } from './nearby-booking.service';
import { GetNextBookingDto } from './dto/get-next-booking.dto';
import { GetTopDoctorsDto } from './dto/get-top-doctors.dto';
import { GetDoctorPatientsDto } from './dto/get-doctor-patients.dto';
import { GetMyAppointmentsDto } from './dto/get-my-appointments.dto';

import { JwtAuthGuard } from '@app/common/guards/jwt.guard';
import { RolesGuard } from '@app/common/guards/role.guard';
import { Roles } from '@app/common/decorator/role.decorator';
import { UserRole } from '@app/common/database/schemas/common.enums';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ApiResponse } from '../common/response/api-response';

@ApiTags('Bookings')
@Controller('bookings')
export class NearbyBookingController {
  constructor(private readonly service: NearbyBookingService) {}

  // ── GET /bookings/top-doctors ─────────────────────────────────────────────
  // Public — no auth required. Declared first to avoid route conflicts.
  @Get('top-doctors')
  async getTopDoctors(
    @Query() query: GetTopDoctorsDto,
    @Headers('accept-language') lang: 'en' | 'ar' = 'en',
  ) {
    const doctors = await this.service.getTopDoctors(Number(query.limit) || 10);
    return ApiResponse.success({
      lang,
      messageKey: 'doctor.TOP_SEARCHED',
      data: doctors,
    });
  }

  // ── GET /bookings/next-user ───────────────────────────────────────────────
  @Get('next-user')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.USER)
  @ApiBearerAuth()
  async getNextBookingForUser(
    @CurrentUser('accountId') accountId: string,
    @Query() query: GetNextBookingDto,
    @Headers('accept-language') lang: 'en' | 'ar' = 'en',
  ) {
    const data = await this.service.getNextBookingForUser(
      accountId,
      query.doctorId,
    );
    return ApiResponse.success({
      lang,
      messageKey: 'booking.NEXT_FOR_USER',
      data,
    });
  }

  // ── GET /bookings/next-doctor ─────────────────────────────────────────────
  @Get('next-doctor')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DOCTOR)
  @ApiBearerAuth()
  async getNextBookingForDoctor(
    @CurrentUser('accountId') accountId: string,
    @Headers('accept-language') lang: 'en' | 'ar' = 'en',
  ) {
    const data = await this.service.getNextBookingForDoctor(accountId);
    return ApiResponse.success({
      lang,
      messageKey: 'booking.NEXT_FOR_DOCTOR',
      data,
    });
  }

  // ── GET /bookings/all ─────────────────────────────────────────────────────
  @Get('all')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.USER)
  @ApiBearerAuth()
  async getAllBookingsForUser(
    @CurrentUser('accountId') accountId: string,
    @Query('status') status?: string,
    @Headers('accept-language') lang: 'en' | 'ar' = 'en',
  ) {
    const data = await this.service.getAllBookingsForUser(accountId, status);
    return ApiResponse.success({
      lang,
      messageKey: 'booking.ALL_FOR_USER',
      data,
    });
  }

  // ── GET /bookings/doctor/patients ─────────────────────────────────────────
  @Get('doctor/patients')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DOCTOR)
  @ApiBearerAuth()
  async getDoctorPatients(
    @CurrentUser('accountId') accountId: string,
    @Query() query: GetDoctorPatientsDto,
    @Headers('accept-language') lang: 'en' | 'ar' = 'en',
  ) {
    const data = await this.service.getDoctorPatients(accountId, query);
    return ApiResponse.success({
      lang,
      messageKey: 'booking.DOCTOR_PATIENTS',
      data,
    });
  }

  // ── GET /bookings/my-appointments ─────────────────────────────────────────
  @Get('my-appointments')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DOCTOR)
  @ApiBearerAuth()
  async getMyAppointments(
    @CurrentUser('accountId') accountId: string,
    @Query() query: GetMyAppointmentsDto,
    @Headers('accept-language') lang: 'en' | 'ar' = 'en',
  ) {
    const data = await this.service.getMyAppointments(accountId, query);
    return ApiResponse.success({
      lang,
      messageKey: 'booking.MY_APPOINTMENTS',
      data,
    });
  }
}
