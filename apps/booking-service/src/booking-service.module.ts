import 'dotenv/config'; // Load env first
import { Module } from '@nestjs/common';
import { BookingServiceController } from './booking-service.controller';
import { BookingServiceService } from './booking-service.service';
import { DatabaseModule } from '@app/common/database/database.module';
import { KafkaModule } from '@app/common/kafka/kafka.module';
import { SlotModule } from './slot/slot.module';

@Module({
  imports: [
    KafkaModule.forRoot({
      clientId: 'booking-service',
      brokers: [process.env.KAFKA_BROKER!],
      groupId: 'booking-consumer',
    }),
    DatabaseModule,
    SlotModule,
  ],
  controllers: [BookingServiceController],
  providers: [BookingServiceService],
})
export class BookingServiceModule {}
