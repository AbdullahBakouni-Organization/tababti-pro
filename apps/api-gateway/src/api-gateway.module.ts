import { Module } from '@nestjs/common';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { ApiGatewayController } from './controllers/api-gateway.controller';
import { ApiGatewayService } from './api-gateway.service';
import { HttpModule } from '@nestjs/axios';
import { HomeProxyController } from './controllers/home-proxy.controller';
import { NotificationProxyController } from './controllers/notification-proxy.controller';
import { BookingProxyController } from './controllers/booking-proxy.controller';
import { SocialProxyController } from './controllers/social-proxy.controller';
import { ProxyService } from './services/proxy.service';
import { RedisThrottlerStorage } from './services/redis-throttler.storage';
import { ThrottlerStorageModule } from './services/throttler-storage.module';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
    }),
    ThrottlerModule.forRootAsync({
      imports: [ThrottlerStorageModule],
      inject: [ConfigService, RedisThrottlerStorage],
      useFactory: (config: ConfigService, storage: RedisThrottlerStorage) => ({
        throttlers: [
          {
            name: 'short',
            ttl: config.get<number>('THROTTLE_SHORT_TTL', 1000), // 1 second
            limit: config.get<number>('THROTTLE_SHORT_LIMIT', 10), // 10 req/sec
          },
          {
            name: 'long',
            ttl: config.get<number>('THROTTLE_LONG_TTL', 60_000), // 1 minute
            limit: config.get<number>('THROTTLE_LONG_LIMIT', 100), // 100 req/min
          },
        ],
        // Shared Redis-backed storage so counters aggregate across replicas.
        storage,
      }),
    }),
    HttpModule.registerAsync({
      // Per-request timeouts and body limits live on the ProxyService; these
      // are only defaults for any direct HttpService usage.
      useFactory: () => ({
        timeout: 15_000,
        maxRedirects: 5,
      }),
    }),
  ],
  controllers: [
    ApiGatewayController,
    HomeProxyController,
    SocialProxyController,
    BookingProxyController,
    NotificationProxyController,
  ],
  providers: [
    ApiGatewayService,
    ProxyService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard, // applies globally to all controllers
    },
  ],
})
export class ApiGatewayModule {}
