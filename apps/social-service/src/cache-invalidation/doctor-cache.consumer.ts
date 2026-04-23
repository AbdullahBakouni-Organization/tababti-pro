import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';

import { KAFKA_TOPICS } from '@app/common/kafka/events/topics';
import { UserService } from '../search/users/users.service';
import { NearbyBookingService } from '../most-searched_nearby-booking/nearby-booking.service';

interface DoctorLifecyclePayload {
  doctorId?: string;
}

/**
 * Reacts to admin-driven doctor lifecycle events (update / delete) and drops
 * the caches that could now serve stale data:
 *
 *   - `NearbyCache`         → doctor-scoped + composite nearby listings
 *   - `booking:top-doctors:*` → "top searched doctors" paginated cache
 *
 * The `/search` filter route is not listed here because its `DoctorSearchQuery`
 * hits Mongo directly and has no result cache to invalidate — the approved-
 * status filter in `DoctorConditionBuilder` guarantees deletions/status flips
 * are reflected on the next request.
 *
 * Consumer-group caveat: `social-consumer` is shared across pods, so a single
 * pod receives each event. `NearbyBookingService.onDoctorSearched` uses
 * `CacheService.invalidatePattern`, which publishes to the Redis invalidation
 * channel — that reaches every pod's L1 LRU. `UserService.invalidateDoctorListings`
 * relies on the 60s memory TTL to converge remote pods.
 */
@Controller()
export class DoctorCacheConsumer {
  private readonly logger = new Logger(DoctorCacheConsumer.name);

  constructor(
    private readonly userService: UserService,
    private readonly nearbyBookingService: NearbyBookingService,
  ) {}

  @EventPattern(KAFKA_TOPICS.DOCTOR_UPDATED)
  async handleDoctorUpdated(@Payload() data: unknown): Promise<void> {
    const payload = this.unwrap(data);
    this.logger.log(
      `doctor.updated received → invalidating caches (doctorId=${payload.doctorId ?? 'unknown'})`,
    );
    await this.invalidateAll();
  }

  @EventPattern(KAFKA_TOPICS.DOCTOR_DELETED)
  async handleDoctorDeleted(@Payload() data: unknown): Promise<void> {
    const payload = this.unwrap(data);
    this.logger.log(
      `doctor.deleted received → invalidating caches (doctorId=${payload.doctorId ?? 'unknown'})`,
    );
    await this.invalidateAll();
  }

  private async invalidateAll(): Promise<void> {
    const results = await Promise.allSettled([
      this.userService.invalidateDoctorListings(),
      this.nearbyBookingService.onDoctorSearched(),
    ]);

    for (const r of results) {
      if (r.status === 'rejected') {
        this.logger.warn(
          `Doctor cache invalidation failed: ${(r.reason as Error)?.message ?? r.reason}`,
        );
      }
    }
  }

  private unwrap(data: unknown): DoctorLifecyclePayload {
    if (data && typeof data === 'object' && 'value' in data) {
      const inner = (data as { value: unknown }).value;
      if (inner && typeof inner === 'object') {
        return inner as DoctorLifecyclePayload;
      }
    }
    return (data ?? {}) as DoctorLifecyclePayload;
  }
}
