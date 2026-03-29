/**
 * Pre-built NestJS provider arrays for common test module setups.
 * Import these into your Test.createTestingModule({ providers: [...] }) calls.
 */

import { ConfigService } from '@nestjs/config';
import { getModelToken, getConnectionToken } from '@nestjs/mongoose';
import { KafkaService } from '../kafka/kafka.service';
import { CacheService } from '../cache/cache.service';
import { RedisService } from '../redis/redis.service';
import { MinioService } from '../file-storage/minio.service';
import { FcmService } from '../fcm/fcm.service';
import { AuthValidateService } from '../auth-validate/auth-validate.service';
import { BookingValidationService } from '../booking-validation/booking-validation.service';
import { createMockModel, createMockConnection } from './mock-model.factory';
import {
  createMockKafkaService,
  createMockCacheService,
  createMockRedisService,
  createMockMinioService,
  createMockFcmService,
  createMockAuthValidateService,
  createMockBookingValidationService,
  createMockConfigService,
} from './mock-services.factory';

/**
 * Core infrastructure mocks (Kafka, Cache, Config).
 * Almost every service needs these.
 */
export const CORE_TEST_PROVIDERS = [
  { provide: KafkaService, useFactory: createMockKafkaService },
  { provide: CacheService, useFactory: createMockCacheService },
  { provide: ConfigService, useFactory: createMockConfigService },
];

/**
 * Full infrastructure mocks (core + Redis, MinIO, FCM, Auth, BookingValidation).
 */
export const FULL_TEST_PROVIDERS = [
  ...CORE_TEST_PROVIDERS,
  { provide: RedisService, useFactory: createMockRedisService },
  { provide: MinioService, useFactory: createMockMinioService },
  { provide: FcmService, useFactory: createMockFcmService },
  { provide: AuthValidateService, useFactory: createMockAuthValidateService },
  {
    provide: BookingValidationService,
    useFactory: createMockBookingValidationService,
  },
];

/**
 * Helper to create mock providers for Mongoose models.
 * Pass schema name strings: mockModelProviders('User', 'Doctor', 'Booking')
 */
export function mockModelProviders(...modelNames: string[]) {
  return modelNames.map((name) => ({
    provide: getModelToken(name),
    useFactory: createMockModel,
  }));
}

/**
 * Mock provider for Mongoose Connection (used for transactions).
 */
export const MOCK_CONNECTION_PROVIDER = {
  provide: getConnectionToken(),
  useFactory: createMockConnection,
};
