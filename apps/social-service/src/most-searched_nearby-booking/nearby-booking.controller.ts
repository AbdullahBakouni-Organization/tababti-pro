import { Controller, Get, Query, UseGuards } from '@nestjs/common';
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

@ApiTags('Bookings')
@Controller('bookings')
export class NearbyBookingController {
  constructor(private readonly service: NearbyBookingService) {}

  @Get('next-user')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.USER)
  async getNextBookingForUser(
    @CurrentUser('id') authAccountId: string,
    @Query() query: GetNextBookingDto,
  ) {
    const booking = await this.service.getNextBookingForUser(
      authAccountId,
      query.doctorId,
    );
    return ApiResponse.success({
      messageKey: 'booking.NEXT_FOR_USER',
      data: booking,
    });
  }

  @Get('next-doctor')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DOCTOR)
  async getNextBookingForDoctor(
    @CurrentUser('accountId') authAccountId: string,
  ) {
    const booking = await this.service.getNextBookingForDoctor(authAccountId);
    return ApiResponse.success({
      messageKey: 'booking.NEXT_FOR_DOCTOR',
      data: booking,
    });
  }

  @Get('top-doctors')
  async getTopDoctors(@Query() query: GetTopDoctorsDto) {
    const doctors = await this.service.getTopDoctors(Number(query.limit) || 10);
    return ApiResponse.success({
      messageKey: 'doctor.TOP_SEARCHED',
      data: doctors,
    });
  }
}
