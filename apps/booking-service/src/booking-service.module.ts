import 'dotenv/config'; // Load env first
import { Module } from '@nestjs/common';
import { BookingController } from './booking-service.controller';
import { BookingService } from './booking-service.service';
import { DatabaseModule } from '@app/common/database/database.module';
import { KafkaModule } from '@app/common/kafka/kafka.module';
import { SlotModule } from './slot/slot.module';
import { CacheModule } from '@app/common/cache/cache.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bull';
import { MinioModule } from '@app/common/file-storage';
import { AuthValidateModule } from '@app/common/auth-validate';
import { BookingValidationModule } from '@app/common/booking-validation';
import { ScheduleModule } from '@nestjs/schedule';
import { ExpiredPendingBookingsCron } from './cron/expired-pending-bookings.cron';
import { CancelExpiredBookingProcessor } from './cron/processors/cancel-expired-booking.processor';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        redis: {
          host: configService.get('REDIS_HOST', 'localhost'),
          port: configService.get('REDIS_PORT', 6379),
          password: configService.get('REDIS_PASSWORD'),
          db: configService.get('REDIS_DB', 0),
          maxRetriesPerRequest: null, // Important for Bull
          enableReadyCheck: false,
        },
        defaultJobOptions: {
          removeOnComplete: true,
          removeOnFail: false,
        },
      }),
      inject: [ConfigService],
    }),
    ScheduleModule.forRoot(),
    BullModule.registerQueue({
      name: 'CANCEL_EXPIRED_BOOKING',
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    }),
    KafkaModule.forProducer({
      clientId: 'booking-service-producer',
      brokers: [process.env.KAFKA_BROKER!],
      groupId: 'booking-consumer',
    }),

    // ✅ ADD THIS: Consumer for receiving events
    KafkaModule.forConsumer({
      clientId: 'booking-service-consumer',
      brokers: [process.env.KAFKA_BROKER!],
      groupId: 'booking-service-group', // Important: Consumer group ID
    }),

    DatabaseModule,
    CacheModule,

    // ✅ ADD THIS: Import SlotModule which contains SlotGenerationService
    SlotModule,
    MinioModule,
    AuthValidateModule,
    BookingValidationModule,
  ],
  controllers: [BookingController],
  providers: [
    BookingService,
    ExpiredPendingBookingsCron,
    CancelExpiredBookingProcessor,
  ],
})
export class BookingServiceModule {}
