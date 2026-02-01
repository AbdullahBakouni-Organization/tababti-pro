import { Module } from '@nestjs/common';
import { CacheService } from './cache.service';
import { RedisModule } from '../redis/redis.module';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { CacheInterceptor } from '../redis/interceptors/cache.interceptor';
import { RateLimitGuard } from '../redis/guards/rate-limit.guard';

@Module({
  imports: [
    RedisModule.forRootAsync({
      useFactory: () => ({
        host: process.env.REDIS_HOST || 'localhost',
        port: Number(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD,
      }),
    }),
  ],
  providers: [
    CacheService,
    {
      provide: APP_INTERCEPTOR,
      useClass: CacheInterceptor,
    },
    {
      provide: APP_GUARD,
      useClass: RateLimitGuard,
    },
  ],
  exports: [CacheService],
})
export class CacheModule {}
