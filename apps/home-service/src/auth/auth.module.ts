import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { DatabaseModule } from '@app/common/database/database.module';
import { SmsService } from '../sms/sms.service';
import { JwtService } from '@nestjs/jwt';
import { JwtStrategy } from '@app/common/strategies/jwt.strategie';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        ttl: 60,
        limit: 5, // 5 requests per minute per IP/phone
      },
    ]),
    DatabaseModule,
  ],
  providers: [
    AuthService,
    JwtService,
    SmsService,
    JwtStrategy,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
  controllers: [AuthController],
  exports: [AuthService],
})
export class AuthModule {}
