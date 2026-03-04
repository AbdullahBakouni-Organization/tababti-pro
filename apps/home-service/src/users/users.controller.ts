import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { UsersService } from './users.service';
import {
  PatientCancelBookingDto,
  CancellationResponseDto,
  BookingValidationResponseDto,
} from './dto/patient-booking.dto';
import { UpdateFCMTokenDto } from './dto/update-fcm.dto';
import {
  BookingStatus,
  UserRole,
} from '@app/common/database/schemas/common.enums';
import { GetUserBookingsDto } from './dto/get-user-bookings.dto';
import { RolesGuard } from '@app/common/guards/role.guard';
import { Roles } from '@app/common/decorator/role.decorator';
import { JwtUserGuard } from '@app/common/guards/jwt-user.guard';
import { ParseMongoIdPipe } from '@app/common/pipes/parse-mongo-id.pipe';

@ApiTags('Patient Bookings')
@Controller('users')
export class UsersController {
  constructor(private readonly patientBookingService: UsersService) {}

  /**
   * Validate if patient can book with a doctor
   */
  @UseGuards(JwtUserGuard, RolesGuard)
  @Roles(UserRole.USER)
  @Get('validate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Validate if patient can book',
    description:
      'Checks if patient can book with a specific doctor. Enforces rules: 1) One booking per doctor, 2) Maximum 3 bookings per day',
  })
  @ApiQuery({ name: 'doctorId', required: true })
  @ApiQuery({ name: 'bookingDate', required: true, description: 'YYYY-MM-DD' })
  @ApiResponse({
    status: 200,
    description: 'Validation result',
    type: BookingValidationResponseDto,
  })
  async validateBooking(
    @Req() req: any,
    @Query('doctorId') doctorId: string,
    @Query('bookingDate') bookingDate: string,
  ): Promise<BookingValidationResponseDto> {
    const patientId = new ParseMongoIdPipe().transform(
      req.user.entity._id.toString(),
    );
    const date = new Date(bookingDate);
    return this.patientBookingService.validateBooking(
      patientId,
      doctorId,
      date,
    );
  }

  /**
   * Patient cancels their booking
   */
  @UseGuards(JwtUserGuard, RolesGuard)
  @Roles(UserRole.USER)
  @Post('cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Patient cancels their booking',
    description:
      'Allows patient to cancel their own booking. Maximum 5 cancellations per day. Doctor receives notification via FCM.',
  })
  @ApiResponse({
    status: 200,
    description: 'Booking cancelled successfully',
    type: CancellationResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: 'Daily cancellation limit reached',
  })
  @ApiResponse({
    status: 404,
    description: 'Booking not found or already cancelled',
  })
  async cancelBooking(
    @Body() dto: PatientCancelBookingDto,
    @Req() req: any,
  ): Promise<CancellationResponseDto> {
    const patientId = new ParseMongoIdPipe().transform(
      req.user.entity._id.toString(),
    );

    return this.patientBookingService.patientCancelBooking(dto, patientId);
  }

  /**
   * Get patient's active bookings count
   */
  @UseGuards(JwtUserGuard, RolesGuard)
  @Roles(UserRole.USER)
  @Get('active-count')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get patient active bookings count',
    description:
      'Returns count of active bookings (total, today, and per doctor)',
  })
  @ApiResponse({
    status: 200,
    description: 'Active bookings count',
  })
  async getActiveBookingsCount(@Req() req: any) {
    const patientId = new ParseMongoIdPipe().transform(
      req.user.entity._id.toString(),
    );
    return this.patientBookingService.getActiveBookingsCount(patientId);
  }

  /**
   * Get patient's cancellations today
   */
  @UseGuards(JwtUserGuard, RolesGuard)
  @Roles(UserRole.USER)
  @Get('cancellations-today')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get patient cancellations today',
    description:
      'Returns count of cancellations today and remaining cancellations allowed',
  })
  @ApiResponse({
    status: 200,
    description: 'Cancellations count',
  })
  async getCancellationsToday(@Req() req: any) {
    const patientId = new ParseMongoIdPipe(cancellations - today).transform(
      req.user.entity._id.toString(),
    );
    return this.patientBookingService.getCancellationsToday(patientId);
  }

  @UseGuards(JwtUserGuard, RolesGuard)
  @Roles(UserRole.USER)
  @Post('update/fcm-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Update FCM token',
    description:
      'Updates the FCM token for a user. This should be called whenever the user logs in or when the token is refreshed by Firebase.',
  })
  @ApiResponse({
    status: 200,
    description: 'FCM token updated successfully',
  })
  async updateFCMToken(@Body() dto: UpdateFCMTokenDto, @Req() req: any) {
    const userId = new ParseMongoIdPipe().transform(
      req.user.entity._id.toString(),
    );
    return this.patientBookingService.updateFCMToken(userId, dto.fcmToken);
  }

  @UseGuards(JwtUserGuard, RolesGuard)
  @Roles(UserRole.USER)
  @Get('my-bookings')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get current user bookings',
    description: `
       Returns paginated bookings for the authenticated user.
       - **cancelled**: includes bookings cancelled by patient OR cancelled/rescheduled by doctor
       - **completed**: appointments that were completed
       - **pending**: upcoming/pending appointments
       - If status is omitted, returns all bookings
       - Cancelled bookings are cached for 1 hour
     `,
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: BookingStatus,
    description: 'Filter by booking status group',
  })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiResponse({
    status: 200,
    description: 'User bookings retrieved successfully',
    schema: {
      example: {
        data: [
          {
            bookingId: '64f1a2b3c4d5e6f7a8b9c0d1',
            status: 'NEEDS_RESCHEDULE',
            bookingDate: '2026-03-01T00:00:00.000Z',
            slot: {
              startTime: '09:00',
              endTime: '09:30',
              location: {
                type: 'HOSPITAL',
                entity_name: 'مستشفى دمشق',
                address: 'شارع بغداد، دمشق',
              },
              inspectionPrice: 5000,
            },
            doctor: {
              fullName: 'د. أحمد الخطيب',
              image: 'https://cdn.example.com/doctors/ahmed.jpg',
            },
            cancellation: {
              cancelledBy: 'SYSTEM',
              reason: 'Doctor updated working hours',
            },
          },
        ],
        meta: {
          total: 25,
          page: 1,
          limit: 10,
          totalPages: 3,
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getMyBookings(@Query() dto: GetUserBookingsDto, @Req() req: any) {
    const userId = req.user.entity._id.toString();
    return this.patientBookingService.getUserBookings(userId, dto);
  }
}
