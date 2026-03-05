import { Module } from '@nestjs/common';
import { NearbyBookingController } from './nearby-booking.controller';
import { NearbyBookingService } from './nearby-booking.service';
import { NearbyBookingRepository } from './nearby-booking.repository';
import { CacheModule } from '@app/common/cache/cache.module';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        ttl: 60,
        limit: 5,
      },
    ]),
    CacheModule,
  ],
  controllers: [NearbyBookingController],
  providers: [
    NearbyBookingService,
    NearbyBookingRepository,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
  exports: [NearbyBookingService],
})
export class NearbyBookingModule {}
