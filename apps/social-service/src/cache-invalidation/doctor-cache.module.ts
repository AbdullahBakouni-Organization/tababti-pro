import { Module } from '@nestjs/common';

import { DoctorCacheConsumer } from './doctor-cache.consumer';
import { UsersModule } from '../search/users/users.module';
import { NearbyBookingModule } from '../most-searched_nearby-booking/nearby-booking.module';

/**
 * Owns the Kafka consumer that reacts to admin doctor update/delete events and
 * drops the search & nearby-booking caches that could otherwise serve stale
 * records.
 */
@Module({
  imports: [UsersModule, NearbyBookingModule],
  controllers: [DoctorCacheConsumer],
})
export class DoctorCacheModule {}
