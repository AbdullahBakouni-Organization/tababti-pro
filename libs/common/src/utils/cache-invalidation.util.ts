import { Logger } from '@nestjs/common';
import { CacheService } from '../cache/cache.service';

export async function invalidateBookingCaches(
  cacheService: CacheService,
  doctorId: string,
  patientId?: string,
  logger?: Logger,
): Promise<void> {
  try {
    const patterns = [
      `doctor:bookings:${doctorId}:*`,
      `slots:available:${doctorId}:*`,
      `doctor:${doctorId}:working-hours`,
    ];

    if (patientId) {
      patterns.push(`patient:bookings:${patientId}:*`);
    }

    await Promise.all(
      patterns.map((pattern) => cacheService.invalidatePattern(pattern)),
    );
  } catch (error) {
    const err = error as Error;
    logger?.warn(`Failed to invalidate booking caches: ${err.message}`);
  }
}

export async function invalidateProfileCaches(
  cacheService: CacheService,
  doctorId: string,
  logger?: Logger,
): Promise<void> {
  try {
    const patterns = [
      `doctor:profile:${doctorId}:*`,
      `doctor:posts:${doctorId}:*`,
      `doctor:gallery:${doctorId}:*`,
    ];

    await Promise.all(
      patterns.map((pattern) => cacheService.invalidatePattern(pattern)),
    );
  } catch (error) {
    const err = error as Error;
    logger?.warn(`Failed to invalidate booking caches: ${err.message}`);
  }
}
