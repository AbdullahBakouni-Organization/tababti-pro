import { Module } from '@nestjs/common';
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

    HttpModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
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
  providers: [ApiGatewayService],
})
export class ApiGatewayModule {}
