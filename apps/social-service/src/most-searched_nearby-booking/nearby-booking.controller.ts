import {
  Controller,
  Get,
  Query,
  UseGuards,
  Headers,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';

import { NearbyBookingService } from './nearby-booking.service';
import { GetDoctorPatientsDto } from './dto/get-doctor-patients.dto';
import { GetMyAppointmentsDto } from './dto/get-my-appointments.dto';
import { SearchPatientsDto } from './dto/search-patients.dto';
import { PatientDetailDto } from './dto/patient.detail.dto';

import { JwtAuthGuard } from '@app/common/guards/jwt.guard';
import { RolesGuard } from '@app/common/guards/role.guard';
import { Roles } from '@app/common/decorator/role.decorator';
import { UserRole } from '@app/common/database/schemas/common.enums';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ApiResponse } from '../common/response/api-response';

type Lang = 'en' | 'ar';

function resolveLang(h?: string): Lang {
  return h === 'ar' ? 'ar' : 'en';
}

const PageQuery = () =>
  ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    example: 1,
    description: 'Page number (default: 1)',
  });

const LimitQuery = () =>
  ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    example: 10,
    description: 'Items per page, max 50 (default: 10)',
  });

@ApiTags('Bookings')
@ApiHeader({
  name: 'accept-language',
  description: 'Response language: en | ar (default: en)',
  required: false,
  schema: { default: 'en', enum: ['en', 'ar'] },
})
@Controller('bookings')
export class NearbyBookingController {
  constructor(private readonly service: NearbyBookingService) {}

  // ── GET /bookings/top-doctors ─────────────────────────────────────────────
  @Get('top-doctors')
  @PageQuery()
  @LimitQuery()
  @ApiOperation({ summary: 'Get top searched doctors' })
  async getTopDoctors(
    @Query('page') page = '1',
    @Query('limit') limit = '10',
    @Headers('accept-language') acceptLanguage?: string,
  ) {
    const data = await this.service.getTopDoctors(Number(page), Number(limit));
    // return ApiResponse.success({
    //   lang: resolveLang(acceptLanguage),
    //   messageKey: 'doctor.TOP_SEARCHED',
    //   data,
    // });
    //
    return data;
  }

  // ── GET /bookings/next-user ───────────────────────────────────────────────
  @Get('next-user')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.USER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get upcoming bookings for user' })
  @ApiQuery({ name: 'doctorId', required: false, type: String })
  @PageQuery()
  @LimitQuery()
  async getNextBookingForUser(
    @CurrentUser('accountId') accountId: string,
    @Query('doctorId') doctorId?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '10',
    @Headers('accept-language') acceptLanguage?: string,
  ) {
    const data = await this.service.getNextBookingForUser(
      accountId,
      Number(page),
      Number(limit),
      doctorId,
    );
    return data;
  }

  // ── GET /bookings/next-doctor ─────────────────────────────────────────────
  @Get('next-doctor')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DOCTOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get upcoming bookings for doctor' })
  @PageQuery()
  @LimitQuery()
  async getNextBookingForDoctor(
    @CurrentUser('accountId') accountId: string,
    @Query('page') page = '1',
    @Query('limit') limit = '10',
    @Headers('accept-language') acceptLanguage?: string,
  ) {
    const data = await this.service.getNextBookingForDoctor(
      accountId,
      Number(page),
      Number(limit),
    );
    return ApiResponse.success({
      lang: resolveLang(acceptLanguage),
      messageKey: 'booking.NEXT_FOR_DOCTOR',
      data,
    });
  }

  // ── GET /bookings/all-bookings ────────────────────────────────────────────
  @Get('all-bookings')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.USER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all bookings for user' })
  @ApiQuery({ name: 'status', required: false, type: String })
  @PageQuery()
  @LimitQuery()
  async getAllBookingsForUser(
    @CurrentUser('accountId') accountId: string,
    @Query('status') status?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '10',
    @Headers('accept-language') acceptLanguage?: string,
  ) {
    const data = await this.service.getAllBookingsForUser(
      accountId,
      status,
      Number(page),
      Number(limit),
    );
    return ApiResponse.success({
      lang: resolveLang(acceptLanguage),
      messageKey: 'booking.ALL_FOR_USER',
      data,
    });
  }

  // ── GET /bookings/doctor/patients ─────────────────────────────────────────
  @Get('doctor/patients')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DOCTOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get doctor patients (completed visits)' })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'fromDate', required: false, type: String })
  @ApiQuery({ name: 'toDate', required: false, type: String })
  @PageQuery()
  @LimitQuery()
  async getDoctorPatients(
    @CurrentUser('accountId') accountId: string,
    @Query() query: GetDoctorPatientsDto,
    @Headers('accept-language') acceptLanguage?: string,
  ) {
    const data = await this.service.getDoctorPatients(accountId, query);
    return ApiResponse.success({
      lang: resolveLang(acceptLanguage),
      messageKey: 'booking.DOCTOR_PATIENTS',
      data,
    });
  }

  // ── GET /bookings/my-appointments ─────────────────────────────────────────
  @Get('my-appointments')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DOCTOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all appointments for doctor' })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'fromDate', required: false, type: String })
  @ApiQuery({ name: 'toDate', required: false, type: String })
  @PageQuery()
  @LimitQuery()
  async getMyAppointments(
    @CurrentUser('accountId') accountId: string,
    @Query() query: GetMyAppointmentsDto,
    @Headers('accept-language') acceptLanguage?: string,
  ) {
    const data = await this.service.getMyAppointments(accountId, query);
    return ApiResponse.success({
      lang: resolveLang(acceptLanguage),
      messageKey: 'booking.MY_APPOINTMENTS',
      data,
    });
  }

  // ── GET /bookings/doctor/search-patients ──────────────────────────────────
  @Get('doctor/search-patients')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DOCTOR)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Search doctor patients with advanced filters and stats',
    description:
      'Search by name/phone, filter by gender, status, date range, location. ' +
      'Returns visit stats, revenue and gender breakdown.',
  })
  async searchDoctorPatients(
    @CurrentUser('accountId') accountId: string,
    @Query(new ValidationPipe({ whitelist: true, transform: true }))
    query: SearchPatientsDto,
    @Headers('accept-language') acceptLanguage?: string,
  ) {
    const data = await this.service.searchDoctorPatientsV2(accountId, query);
    return ApiResponse.success({
      lang: resolveLang(acceptLanguage),
      messageKey: 'booking.DOCTOR_PATIENTS',
      data,
    });
  }

  // ── GET /bookings/doctor/patient-detail ───────────────────────────────────
  @Get('doctor/patient-detail')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DOCTOR)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get patient full detail and booking history',
    description:
      'Returns patient info card, 3 stat cards ' +
      '(total paid / completed / total appointments) and paginated booking history.',
  })
  async getPatientDetail(
    @CurrentUser('accountId') accountId: string,
    @Query(new ValidationPipe({ whitelist: true, transform: true }))
    query: PatientDetailDto,
    @Headers('accept-language') acceptLanguage?: string,
  ) {
    const data = await this.service.getPatientDetail(accountId, query);
    return ApiResponse.success({
      lang: resolveLang(acceptLanguage),
      messageKey: 'booking.DOCTOR_PATIENTS',
      data,
    });
  }
}
