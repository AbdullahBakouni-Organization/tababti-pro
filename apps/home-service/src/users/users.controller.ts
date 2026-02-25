import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { UsersService } from './users.service';
import {
  PatientCancelBookingDto,
  CancellationResponseDto,
  BookingValidationResponseDto,
} from './dto/patient-booking.dto';

@ApiTags('Patient Bookings')
@Controller('users')
export class UsersController {
  constructor(private readonly patientBookingService: UsersService) {}

  /**
   * Validate if patient can book with a doctor
   */
  @Get('validate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Validate if patient can book',
    description:
      'Checks if patient can book with a specific doctor. Enforces rules: 1) One booking per doctor, 2) Maximum 3 bookings per day',
  })
  @ApiQuery({ name: 'patientId', required: true })
  @ApiQuery({ name: 'doctorId', required: true })
  @ApiQuery({ name: 'bookingDate', required: true, description: 'YYYY-MM-DD' })
  @ApiResponse({
    status: 200,
    description: 'Validation result',
    type: BookingValidationResponseDto,
  })
  async validateBooking(
    @Query('patientId') patientId: string,
    @Query('doctorId') doctorId: string,
    @Query('bookingDate') bookingDate: string,
  ): Promise<BookingValidationResponseDto> {
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
  ): Promise<CancellationResponseDto> {
    return this.patientBookingService.patientCancelBooking(dto);
  }

  /**
   * Get patient's active bookings count
   */
  @Get(':patientId/active-count')
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
  async getActiveBookingsCount(@Param('patientId') patientId: string) {
    return this.patientBookingService.getActiveBookingsCount(patientId);
  }

  /**
   * Get patient's cancellations today
   */
  @Get(':patientId/cancellations-today')
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
  async getCancellationsToday(@Param('patientId') patientId: string) {
    return this.patientBookingService.getCancellationsToday(patientId);
  }
}
