import { Logger } from '@nestjs/common';
import { CacheService } from '../cache/cache.service';

export async function invalidateBookingCaches(
  cacheService: CacheService,
  doctorId: string,
  patientId?: string | string[],
  logger?: Logger,
): Promise<void> {
  try {
    const patterns = [
      `doctor:bookings:${doctorId}:*`,
      `slots:available:${doctorId}:*`,
      `doctor:${doctorId}:working-hours`,
      `doctor_mobile_profile:${doctorId}`,
    ];

    const patientIds = patientId
      ? Array.isArray(patientId)
        ? patientId
        : [patientId]
      : [];

    for (const id of patientIds) {
      patterns.push(
        `user_bookings:${id}:*`,
        `booking:next-user:${id}:*`,
        `patient:bookings:${id}:*`,
      );
    }

    await Promise.all(
      patterns.map((pattern) => cacheService.invalidatePattern(pattern)),
    );
  } catch (error) {
    const err = error as Error;
    logger?.warn(`Failed to invalidate booking caches: ${err.message}`);
  }
}
export async function invalidateProfileDoctorPostCaches(
  cacheService: CacheService,
  doctorId: string,
  logger?: Logger,
): Promise<void> {
  try {
    const patterns = [
      `doctor:posts:${doctorId}:*`,
      `doctors:posts:${doctorId}:*`,
      `approved_posts:*`,
    ];

    await Promise.all(
      patterns.map((pattern) => cacheService.invalidatePattern(pattern)),
    );
  } catch (error) {
    const err = error as Error;
    logger?.warn(`Failed to invalidate booking caches: ${err.message}`);
  }
}
export async function invalidateProfileDoctorGalleryCaches(
  cacheService: CacheService,
  doctorId: string,
  logger?: Logger,
): Promise<void> {
  try {
    const patterns = [
      `doctor:gallery:${doctorId}:*`,
      `doctor_mobile_profile:${doctorId}:gallery:*`,
      `doctors:gallery:${doctorId}:*`,
    ];

    await Promise.all(
      patterns.map((pattern) => cacheService.invalidatePattern(pattern)),
    );
  } catch (error) {
    const err = error as Error;
    logger?.warn(`Failed to invalidate booking caches: ${err.message}`);
  }
}

export async function invalidateMainProfileCaches(
  cacheService: CacheService,
  authAccountId: string,
  logger?: Logger,
): Promise<void> {
  try {
    const patterns = [
      `doctor:profile:${authAccountId}`,
      `doctors:profile:${authAccountId}:*`,
    ];

    await Promise.all(
      patterns.map((pattern) => cacheService.invalidatePattern(pattern)),
    );
  } catch (error) {
    const err = error as Error;
    logger?.warn(`Failed to invalidate booking caches: ${err.message}`);
  }
}

export async function invalidateQuestionsCaches(
  cacheService: CacheService,
  logger?: Logger,
): Promise<void> {
  try {
    const patterns = [`questions:*`];

    await Promise.all(
      patterns.map((pattern) => cacheService.invalidatePattern(pattern)),
    );
  } catch (error) {
    const err = error as Error;
    logger?.warn(`Failed to invalidate booking caches: ${err.message}`);
  }
}
