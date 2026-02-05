import { Module } from '@nestjs/common';
import { SocketServerController } from './socket-server.controller';
import { SocketServerService } from './socket-server.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { NotificationServiceController } from './notification.controller';

@Module({
  imports: [
    ConfigModule.forRoot(),

    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get('JWT_SECRET'),
        signOptions: { expiresIn: '15m' },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [SocketServerController, NotificationServiceController],
  providers: [SocketServerService],
  exports: [SocketServerService],
})
export class SocketServerModule {}
