import { Controller, Get, Query, UseGuards, Headers } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiQuery, ApiTags } from '@nestjs/swagger';

import { NearbyBookingService } from './nearby-booking.service';
import { GetDoctorPatientsDto } from './dto/get-doctor-patients.dto';
import { GetMyAppointmentsDto } from './dto/get-my-appointments.dto';

import { JwtAuthGuard } from '@app/common/guards/jwt.guard';
import { RolesGuard } from '@app/common/guards/role.guard';
import { Roles } from '@app/common/decorator/role.decorator';
import { UserRole } from '@app/common/database/schemas/common.enums';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ApiResponse } from '@app/common/response/api-response';

type Lang = 'en' | 'ar';

function resolveLang(h?: string): Lang {
  return h === 'ar' ? 'ar' : 'en';
}

function parsePage(v = '1') {
  return Math.max(1, parseInt(v, 10));
}
function parseLimit(v = '10') {
  return Math.min(Math.max(1, parseInt(v, 10)), 50);
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
  async getTopDoctors(
    @Query('page') page = '1',
    @Query('limit') limit = '10',
    @Headers('accept-language') acceptLanguage?: string,
  ) {
    const data = await this.service.getTopDoctors(
      parsePage(page),
      parseLimit(limit),
    );
    return ApiResponse.success({
      lang: resolveLang(acceptLanguage),
      messageKey: 'doctor.TOP_SEARCHED',
      data,
    });
  }

  // ── GET /bookings/next-user ───────────────────────────────────────────────
  @Get('next-user')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.USER)
  @ApiBearerAuth()
  @ApiQuery({
    name: 'doctorId',
    required: false,
    type: String,
    description: 'Filter by doctor ID',
  })
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
      parsePage(page),
      parseLimit(limit),
      doctorId,
    );
    return ApiResponse.success({
      lang: resolveLang(acceptLanguage),
      messageKey: 'booking.NEXT_FOR_USER',
      data,
    });
  }

  // ── GET /bookings/next-doctor ─────────────────────────────────────────────
  @Get('next-doctor')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DOCTOR)
  @ApiBearerAuth()
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
      parsePage(page),
      parseLimit(limit),
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
  @ApiQuery({
    name: 'status',
    required: false,
    type: String,
    description: 'Filter by booking status',
  })
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
      parsePage(page),
      parseLimit(limit),
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
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'Search by patient name or phone',
  })
  @ApiQuery({
    name: 'fromDate',
    required: false,
    type: String,
    description: 'Filter from date (ISO 8601)',
  })
  @ApiQuery({
    name: 'toDate',
    required: false,
    type: String,
    description: 'Filter to date (ISO 8601)',
  })
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
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'Search by patient name or phone',
  })
  @ApiQuery({
    name: 'fromDate',
    required: false,
    type: String,
    description: 'Filter from date (ISO 8601)',
  })
  @ApiQuery({
    name: 'toDate',
    required: false,
    type: String,
    description: 'Filter to date (ISO 8601)',
  })
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
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'Search by patient name or phone',
  })
  @PageQuery()
  @LimitQuery()
  async searchDoctorPatients(
    @CurrentUser('accountId') accountId: string,
    @Query('search') search: string,
    @Query('page') page = '1',
    @Query('limit') limit = '10',
    @Headers('accept-language') acceptLanguage?: string,
  ) {
    const data = await this.service.searchDoctorPatients(
      accountId,
      search,
      parsePage(page),
      parseLimit(limit),
    );
    return ApiResponse.success({
      lang: resolveLang(acceptLanguage),
      messageKey: 'booking.DOCTOR_PATIENTS',
      data,
    });
  }
}
