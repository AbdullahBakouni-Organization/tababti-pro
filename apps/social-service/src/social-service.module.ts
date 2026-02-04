import 'dotenv/config'; // Load env first
import { Module } from '@nestjs/common';
import { SocialServiceController } from './social-service.controller';
import { SocialServiceService } from './social-service.service';
import { KafkaModule } from '@app/common/kafka/kafka.module';

@Module({
  imports: [
    KafkaModule.forRoot({
      clientId: 'home-service',
      brokers: [process.env.KAFKA_BROKER!],
      groupId: 'home-consumer',
    }),
  ],
  controllers: [SocialServiceController],
  providers: [SocialServiceService],
})
export class SocialServiceModule {}
