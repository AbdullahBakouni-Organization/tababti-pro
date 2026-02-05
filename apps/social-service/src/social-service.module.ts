import 'dotenv/config';
import { Module } from '@nestjs/common';
import { SocialServiceController } from './social-service.controller';
import { SocialServiceService } from './social-service.service';
import { KafkaModule } from '@app/common/kafka/kafka.module';
import { DatabaseModule } from '@app/common/database/database.module';
import { QuestionsModule } from './questions/questions.module';
import { AuthModule } from 'apps/home-service/src/auth/auth.module';

@Module({
  imports: [
    KafkaModule.forRoot({
      clientId: 'social-service',
      brokers: [process.env.KAFKA_BROKER!],
      groupId: 'social-consumer',
    }),

    DatabaseModule,
   // AuthModule,
    QuestionsModule,
  ],
  controllers: [SocialServiceController],
  providers: [SocialServiceService],
})
export class SocialServiceModule {}
