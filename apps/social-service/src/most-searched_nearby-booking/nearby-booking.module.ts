import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { NearbyBookingController } from './nearby-booking.controller';
import { NearbyBookingService } from './nearby-booking.service';
import { NearbyBookingRepository } from './nearby-booking.repository';

import {
  Booking,
  BookingSchema,
} from '@app/common/database/schemas/booking.schema';
import {
  Doctor,
  DoctorSchema,
} from '@app/common/database/schemas/doctor.schema';
import { User, UserSchema } from '@app/common/database/schemas/user.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Booking.name, schema: BookingSchema },
      { name: Doctor.name, schema: DoctorSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [NearbyBookingController],
  providers: [NearbyBookingService, NearbyBookingRepository],
  exports: [NearbyBookingService],
})
export class NearbyBookingModule {}
