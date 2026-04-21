import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RedisThrottlerStorage } from './redis-throttler.storage';

/**
 * Module-scoping wrapper for the Redis-backed ThrottlerStorage provider.
 *
 * `ThrottlerModule.forRootAsync({ imports: [ThrottlerStorageModule], inject: [RedisThrottlerStorage] })`
 * expects the injected provider to come from a module it imports — a plain
 * `providers: [...]` entry on the root module is evaluated too late.
 */
@Module({
  imports: [ConfigModule],
  providers: [RedisThrottlerStorage],
  exports: [RedisThrottlerStorage],
})
export class ThrottlerStorageModule {}
