import { Controller, Get, Query, UseGuards, Headers } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { NearbyBookingService } from './nearby-booking.service';
import { GetNextBookingDto } from './dto/get-next-booking.dto';
import { GetTopDoctorsDto } from './dto/get-top-doctors.dto';
import { JwtAuthGuard } from '@app/common/guards/jwt.guard';
import { RolesGuard } from '@app/common/guards/role.guard';
import { Roles } from '@app/common/decorator/role.decorator';
import { UserRole } from '@app/common/database/schemas/common.enums';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ApiResponse } from '../common/response/api-response';
import { GetDoctorPatientsDto } from './dto/get-doctor-patients.dto';

@ApiTags('Bookings')
@Controller('bookings')
export class NearbyBookingController {
  constructor(private readonly service: NearbyBookingService) { }

  // ================= NEXT BOOKING FOR USER =================
  @Get('next-user')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.USER)
  async getNextBookingForUser(
    @CurrentUser('accountId') authAccountId: string,
    @Query() query: GetNextBookingDto,
    @Headers('accept-language') lang: 'en' | 'ar' = 'en',
  ) {
    const booking = await this.service.getNextBookingForUser(
      authAccountId,
      query.doctorId,
    );

    return ApiResponse.success({
      lang,
      messageKey: 'booking.NEXT_FOR_USER',
      data: booking,
    });
  }

  // ================= NEXT BOOKING FOR DOCTOR =================
  @Get('next-doctor')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DOCTOR)
  async getNextBookingForDoctor(
    @CurrentUser('accountId') authAccountId: string,
    @Headers('accept-language') lang: 'en' | 'ar' = 'en',
  ) {
    const booking = await this.service.getNextBookingForDoctor(authAccountId);

    return ApiResponse.success({
      lang,
      messageKey: 'booking.NEXT_FOR_DOCTOR',
      data: booking,
    });
  }

  // ================= TOP DOCTORS =================
  @Get('top-doctors')
  async getTopDoctors(
    @Query() query: GetTopDoctorsDto,
    @Headers('accept-language') lang: 'en' | 'ar' = 'en',
  ) {
    const doctors = await this.service.getTopDoctors(
      Number(query.limit) || 10,
    );

    return ApiResponse.success({
      lang,
      messageKey: 'doctor.TOP_SEARCHED',
      data: doctors,
    });
  }

  // ================= ALL BOOKINGS =================
  @Get('all-bookings')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.USER, UserRole.DOCTOR)
  async getAllBookingsForUser(
    @CurrentUser('accountId') authAccountId: string,
    @Query('status') status?: string,
    @Headers('accept-language') lang: 'en' | 'ar' = 'en',
  ) {
    const bookings = await this.service.getAllBookingsForUser(
      authAccountId,
      status,
    );

    return ApiResponse.success({
      lang,
      messageKey: 'booking.ALL_FOR_USER',
      data: bookings,
    });
  }

  @Get('doctor/patients')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DOCTOR)
  async getDoctorPatients(
    @CurrentUser('accountId') authAccountId: string,
    @Query() query: GetDoctorPatientsDto,
    @Headers('accept-language') lang: 'en' | 'ar' = 'en',
  ) {
    const patients = await this.service.getDoctorPatients(
      authAccountId,
      query,
    );

    return ApiResponse.success({
      lang,
      messageKey: 'booking.DOCTOR_PATIENTS',
      data: patients,
    });
  }

  @Get('my-appointments')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DOCTOR) 
  async getMyAppointments(
    @CurrentUser('accountId') authAccountId: string,
    @Headers('accept-language') lang: 'en' | 'ar' = 'en',
    @Query() filters?: any,
  ) {
    const appointments = await this.service.getMyAppointments(authAccountId, filters);

    return ApiResponse.success({
      lang,
      messageKey: 'booking.MY_APPOINTMENTS',
      data: appointments,
    });
  }
}