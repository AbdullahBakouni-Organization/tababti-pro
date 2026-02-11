import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { BookingService } from './booking-service.service';
import { CreateBookingDto, BookingResponseDto } from './dto/create-booking.dto';
import { BookingStatus } from '@app/common/database/schemas/common.enums';

@ApiTags('Bookings')
@Controller('bookings')
export class BookingController {
  constructor(private readonly bookingService: BookingService) {}

  /**
   * Create a new booking
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a new booking',
    description:
      'Books an appointment slot for a patient. Uses MongoDB transactions to ensure atomic slot reservation and prevent double booking.',
  })
  @ApiResponse({
    status: 201,
    description: 'Booking created successfully',
    type: BookingResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Patient, Doctor, or Slot not found',
  })
  @ApiResponse({
    status: 409,
    description: 'Slot already booked or duplicate booking exists',
  })
  async createBooking(
    @Body() createBookingDto: CreateBookingDto,
  ): Promise<BookingResponseDto> {
    return this.bookingService.createBooking(createBookingDto);
  }

  /**
   * Get patient's bookings
   */
  @Get('patient/:patientId')
  @ApiOperation({
    summary: 'Get all bookings for a patient',
    description:
      'Retrieve all bookings for a specific patient, optionally filtered by status',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: BookingStatus,
    description: 'Filter by booking status',
  })
  @ApiResponse({
    status: 200,
    description: 'Patient bookings retrieved successfully',
    type: [BookingResponseDto],
  })
  async getPatientBookings(
    @Param('patientId') patientId: string,
    @Query('status') status?: BookingStatus,
  ): Promise<BookingResponseDto[]> {
    return this.bookingService.getPatientBookings(patientId, status);
  }

  /**
   * Get doctor's bookings
   */
  @Get('doctor/:doctorId')
  @ApiOperation({
    summary: 'Get all bookings for a doctor',
    description:
      'Retrieve all bookings for a specific doctor, optionally filtered by status',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: BookingStatus,
    description: 'Filter by booking status',
  })
  @ApiResponse({
    status: 200,
    description: 'Doctor bookings retrieved successfully',
    type: [BookingResponseDto],
  })
  async getDoctorBookings(
    @Param('doctorId') doctorId: string,
    @Query('status') status?: BookingStatus,
  ): Promise<BookingResponseDto[]> {
    return this.bookingService.getDoctorBookings(doctorId, status);
  }

  /**
   * Cancel a booking
   */
  @Post(':bookingId/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cancel a booking',
    description: 'Cancels a booking and frees up the associated slot',
  })
  @ApiResponse({
    status: 200,
    description: 'Booking cancelled successfully',
    type: BookingResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Booking not found or already cancelled',
  })
  async cancelBooking(
    @Param('bookingId') bookingId: string,
    @Body('cancelledBy') cancelledBy: string,
    @Body('reason') reason: string,
  ): Promise<BookingResponseDto> {
    return this.bookingService.cancelBooking(bookingId, cancelledBy, reason);
  }
}
