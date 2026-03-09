// import {
//   Controller,
//   Post,
//   Body,
//   HttpCode,
//   HttpStatus,
//   UseGuards,
//   Req,
// } from '@nestjs/common';
// import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
// import { BookingService } from './booking-service.service';
// import { CreateBookingDto, BookingResponseDto } from './dto/create-booking.dto';
// import { UserRole } from '@app/common/database/schemas/common.enums';
// import { JwtUserGuard } from '@app/common/guards/jwt-user.guard';
// import { RolesGuard } from '@app/common/guards/role.guard';
// import { Roles } from '@app/common/decorator/role.decorator';
// import { ParseMongoIdPipe } from '@app/common/pipes/parse-mongo-id.pipe';

// @ApiTags('Bookings')
// @Controller('bookings')
// export class BookingController {
//   constructor(private readonly bookingService: BookingService) {}

//   /**
//    * Create a new booking
//    */
//   @UseGuards(JwtUserGuard, RolesGuard)
//   @Roles(UserRole.USER)
//   @Post()
//   @HttpCode(HttpStatus.CREATED)
//   @ApiOperation({
//     summary: 'Create a new booking',
//     description:
//       'Books an appointment slot for a patient. Uses MongoDB transactions to ensure atomic slot reservation and prevent double booking.',
//   })
//   @ApiResponse({
//     status: 201,
//     description: 'Booking created successfully',
//     type: BookingResponseDto,
//   })
//   @ApiResponse({
//     status: 404,
//     description: 'Patient, Doctor, or Slot not found',
//   })
//   @ApiResponse({
//     status: 409,
//     description: 'Slot already booked or duplicate booking exists',
//   })
//   async createBooking(
//     @Body() createBookingDto: CreateBookingDto,
//     @Req() req: any,
//   ): Promise<BookingResponseDto> {
//     const patientId = new ParseMongoIdPipe().transform(
//       req.user.entity._id.toString(),
//     );
//     return this.bookingService.createBooking(createBookingDto, patientId);
//   }
// }

import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  Req,
  Headers,
  UnauthorizedException, // ✅ Added
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiHeader } from '@nestjs/swagger';
import { BookingService } from './booking-service.service';
import { CreateBookingDto, BookingResponseDto } from './dto/create-booking.dto';
import { UserRole } from '@app/common/database/schemas/common.enums';
import { JwtUserGuard } from '@app/common/guards/jwt-user.guard';
import { RolesGuard } from '@app/common/guards/role.guard';
import { Roles } from '@app/common/decorator/role.decorator';
import { ParseMongoIdPipe } from '@app/common/pipes/parse-mongo-id.pipe';
import { ApiResponse as AppApiResponse } from '@app/common/response/api-response';

type Lang = 'en' | 'ar';
function resolveLang(h?: string): Lang {
  return h === 'ar' ? 'ar' : 'en';
}

@ApiTags('Bookings')
@ApiHeader({
  name: 'accept-language',
  description: 'Response language: en | ar',
  required: false,
  schema: { default: 'en', enum: ['en', 'ar'] },
})
@Controller('bookings')
export class BookingController {
  constructor(private readonly bookingService: BookingService) {}

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
    status: 401,
    description: 'Unauthorized - user session not found',
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
    @Headers('accept-language') acceptLanguage?: string,
  ) {
    console.log('req.user full object:', JSON.stringify(req.user, null, 2));
    const lang = resolveLang(acceptLanguage);

    // ✅ Root fix: guard against null entity before touching ._id
    if (!req.user?.entity?._id) {
      throw new UnauthorizedException('user.SESSION_EXPIRED_OR_NOT_FOUND');
    }

    const patientId = new ParseMongoIdPipe().transform(
      req.user.entity._id.toString(),
    );

    const data = await this.bookingService.createBooking(
      createBookingDto,
      patientId,
    );

    return AppApiResponse.success({
      lang,
      messageKey: 'booking.CREATED',
      data,
    });
  }
}
