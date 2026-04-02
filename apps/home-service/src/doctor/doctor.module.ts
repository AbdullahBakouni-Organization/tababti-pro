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
import { FcmModule } from '@app/common/fcm';
import { PauseSlotsProcessor } from './processors/Pause slots.processor';
import { VIPBookingProcessor } from './processors/VibBooking.processor';
import { HolidayBlockProcessor } from './processors/holidayblock.processor';
import { PatientStatsCron } from './cron/patient-stats.cron';
import { ScheduleModule } from '@nestjs/schedule';
import { DoctorBookingsQueryService } from './doctor.service.v2';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { MinioModule } from '@app/common/file-storage';
import { WhatsappModule } from '../whatsapp/whatsapp.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([
      {
        ttl: 60,
        limit: 5,
      },
    ]),
    ConfigModule.forRoot({
      isGlobal: true,
    }),
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
    BullModule.registerQueue({
      name: 'vip-booking',
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
    BullModule.registerQueue({
      name: 'holiday-block',
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
    MinioModule,
    WhatsappModule,
  ],
  providers: [
    DoctorService,
    SmsService,
    PauseSlotsProcessor,
    VIPBookingProcessor,
    HolidayBlockProcessor,
    PatientStatsCron,
    DoctorBookingsQueryService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
  controllers: [DoctorController],
})
export class DoctorModule {}
