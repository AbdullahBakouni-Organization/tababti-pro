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

@Module({
  imports: [
    // ⚠️ CRITICAL FIX: You need BOTH producer AND consumer
    // Producer for sending events (if needed)
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
    KafkaModule.forProducer({
      clientId: 'booking-service-producer',
      brokers: [process.env.KAFKA_BROKER!],
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
  ],
  controllers: [BookingController],
  providers: [BookingService],
})
export class BookingServiceModule {}
