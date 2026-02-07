import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { DatabaseModule } from '@app/common/database/database.module';
import { SmsService } from '../sms/sms.service';
import { JwtService } from '@nestjs/jwt';
import { JwtStrategy } from '@app/common/strategies/jwt.strategie';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { KafkaModule } from '@app/common/kafka/kafka.module';

@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        ttl: 60,
        limit: 5,
      },
    ]),
    DatabaseModule,
    KafkaModule.forRoot({
      clientId: 'home-producer',
      brokers: [process.env.KAFKA_BROKER!],
      groupId: 'home-producer',
    }),
  ],
  providers: [
    AuthService,
    JwtService,
    SmsService,
    JwtStrategy,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
  controllers: [AuthController],
  exports: [AuthService, JwtStrategy],
})
export class AuthModule {}
