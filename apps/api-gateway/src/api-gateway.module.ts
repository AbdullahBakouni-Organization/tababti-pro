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
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            name: 'short',
            ttl: config.get<number>('THROTTLE_SHORT_TTL', 1000), // 1 second
            limit: config.get<number>('THROTTLE_SHORT_LIMIT', 10), // 10 req/sec
          },
          {
            name: 'long',
            ttl: config.get<number>('THROTTLE_LONG_TTL', 60000), // 1 minute
            limit: config.get<number>('THROTTLE_LONG_LIMIT', 100), // 200 req/min
          },
        ],
      }),
    }),
    HttpModule.registerAsync({
      inject: [ConfigService],
      useFactory: () => ({
        timeout: 5000,
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
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard, // applies globally to all controllers
    },
  ],
})
export class ApiGatewayModule {}
