import { Module } from '@nestjs/common';
import { NearbyBookingController } from './nearby-booking.controller';
import { NearbyBookingService } from './nearby-booking.service';
import { NearbyBookingRepository } from './nearby-booking.repository';

@Module({
  controllers: [NearbyBookingController],
  providers: [NearbyBookingService, NearbyBookingRepository],
  exports: [NearbyBookingService],
})
export class NearbyBookingModule {}
