import { Module } from '@nestjs/common';
import { NotificationServiceController } from './notification-service.controller';
import { NotificationService } from './notification-service.service';
import { FcmModule } from '@app/common/fcm';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '@app/common/database/database.module';
import { AuthValidateModule } from '@app/common/auth-validate';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    FcmModule,
    DatabaseModule,
    AuthValidateModule,
  ],
  controllers: [NotificationServiceController],
  providers: [NotificationService],
})
export class NotificationServiceModule {}
