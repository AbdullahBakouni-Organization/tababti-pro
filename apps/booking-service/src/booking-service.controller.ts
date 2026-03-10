import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { BookingService } from './booking-service.service';
import { CreateBookingDto, BookingResponseDto } from './dto/create-booking.dto';
import { UserRole } from '@app/common/database/schemas/common.enums';
import { JwtUserGuard } from '@app/common/guards/jwt-user.guard';
import { RolesGuard } from '@app/common/guards/role.guard';
import { Roles } from '@app/common/decorator/role.decorator';
import { ParseMongoIdPipe } from '@app/common/pipes/parse-mongo-id.pipe';

@ApiTags('Bookings')
@Controller('bookings')
export class BookingController {
  constructor(private readonly bookingService: BookingService) {}

  /**
   * Create a new booking
   */
  @UseGuards(JwtUserGuard, RolesGuard)
  @Roles(UserRole.USER)
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
    @Req() req: any,
  ): Promise<BookingResponseDto> {
    const patientId = new ParseMongoIdPipe().transform(
      req.user.entity._id.toString(),
    );
    return this.bookingService.createBooking(createBookingDto, patientId);
  }
}
