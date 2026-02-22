import { Module } from '@nestjs/common';
import { DoctorService } from './doctor.service';
import { DoctorController } from './doctor.controller';
import { AuthValidateModule } from '../../../../libs/common/src/auth-validate/auth-validate.module';
import { KafkaModule } from '../../../../libs/common/src/kafka/kafka.module';
import { DatabaseModule } from '@app/common/database/database.module';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { SmsService } from '../sms/sms.service';
import { CacheModule } from '@app/common/cache/cache.module';
import { BullModule } from '@nestjs/bull';
import { FcmModule } from '../fcm/fcm.module';
import { PauseSlotsProcessor } from './processors/Pause slots.processor';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'pause-slots',
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: 100, // Keep last 100 completed jobs
        removeOnFail: 500, // Keep last 500 failed jobs for debugging
      },
    }),
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    DatabaseModule,
    AuthValidateModule,
    KafkaModule.forRoot({
      clientId: 'home-consumer-server',
      brokers: [process.env.KAFKA_BROKER || 'localhost:29092'],
      groupId: 'home-consumer-group',
    }),
    HttpModule.register({
      timeout: 3000,
    }),
    CacheModule,
    FcmModule,
  ],
  providers: [DoctorService, SmsService, PauseSlotsProcessor],
  controllers: [DoctorController],
})
export class DoctorModule {}
