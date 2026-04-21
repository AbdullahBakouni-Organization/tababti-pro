import { Module } from '@nestjs/common';
import { CacheService } from './cache.service';
import { RedisModule } from '../redis/redis.module';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { CacheInterceptor } from '../redis/interceptors/cache.interceptor';

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
  ],
  exports: [CacheService],
})
export class CacheModule {}
