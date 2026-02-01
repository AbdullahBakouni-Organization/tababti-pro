import 'dotenv/config'; // Load env first
import { Module } from '@nestjs/common';
import { HomeServiceController } from './home-service.controller';
import { HomeServiceService } from './home-service.service';
import { DatabaseModule } from '@app/common/database/database.module';
import { KafkaModule } from '@app/common/kafka/kafka.module';

@Module({
  imports: [
    KafkaModule.forRoot({
      clientId: 'home-service',
      brokers: [process.env.KAFKA_BROKER!],
      groupId: 'home-consumer',
    }),
    DatabaseModule,
  ],
  controllers: [HomeServiceController],
  providers: [HomeServiceService],
})
export class HomeServiceModule {}
