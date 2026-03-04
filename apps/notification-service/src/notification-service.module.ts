import { Module } from '@nestjs/common';
import { NotificationServiceController } from './notification-service.controller';
import { NotificationService } from './notification-service.service';
import { FcmModule } from 'apps/home-service/src/fcm/fcm.module';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '@app/common/database/database.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    FcmModule,
    DatabaseModule,
  ],
  controllers: [NotificationServiceController],
  providers: [NotificationService],
})
export class NotificationServiceModule {}
