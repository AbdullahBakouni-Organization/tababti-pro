import { Module } from '@nestjs/common';
import { SocialServiceController } from './social-service.controller';
import { SocialServiceService } from './social-service.service';
import { KafkaModule } from '@app/common/kafka/kafka.module';
import { DatabaseModule } from '@app/common/database/database.module';
import { QuestionsModule } from './questions/questions.module';
import { JwtModule } from '@nestjs/jwt';
import { AuthValidateModule } from '@app/common/auth-validate';

@Module({
  imports: [
    KafkaModule.forRoot({
      clientId: 'social-service',
      brokers: [process.env.KAFKA_BROKER!],
      groupId: 'social-consumer',
    }),
    DatabaseModule,
    AuthValidateModule,
    QuestionsModule,
    JwtModule.register({
      secret: process.env.JWT_ACCESS_SECRET,
    }),
  ],
  controllers: [SocialServiceController],
  providers: [SocialServiceService], 
})
export class SocialServiceModule {}
