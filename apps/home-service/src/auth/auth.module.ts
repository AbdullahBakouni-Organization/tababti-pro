import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { DatabaseModule } from '@app/common/database/database.module';
import { SmsService } from '../sms/sms.service';
// import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AuthValidateModule } from '@app/common/auth-validate';
import { MinioModule } from '../minio/minio.module';
@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        ttl: 60,
        limit: 5,
      },
    ]),
    DatabaseModule,
    AuthValidateModule,
    // WhatsappModule,
    MinioModule,
  ],
  providers: [
    AuthService,
    SmsService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
  controllers: [AuthController],
  exports: [AuthService],
})
export class AuthModule {}
