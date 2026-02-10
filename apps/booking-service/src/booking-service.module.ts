import 'dotenv/config'; // Load env first
import { Module } from '@nestjs/common';
import { BookingServiceController } from './booking-service.controller';
import { BookingServiceService } from './booking-service.service';
import { DatabaseModule } from '@app/common/database/database.module';
import { KafkaModule } from '@app/common/kafka/kafka.module';
import { SlotModule } from './slot/slot.module';
import { CacheModule } from '@app/common/cache/cache.module';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    // ⚠️ CRITICAL FIX: You need BOTH producer AND consumer
    // Producer for sending events (if needed)
    ConfigModule.forRoot({
      isGlobal: true,
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
  controllers: [BookingServiceController],
  providers: [BookingServiceService],
})
export class BookingServiceModule {}
