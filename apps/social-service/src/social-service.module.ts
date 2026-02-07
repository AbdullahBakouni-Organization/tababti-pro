import { Module, Post } from '@nestjs/common';
import { SocialServiceController } from './social-service.controller';
import { SocialServiceService } from './social-service.service';
import { KafkaModule } from '@app/common/kafka/kafka.module';
import { DatabaseModule } from '@app/common/database/database.module';
import { QuestionsModule } from './questions/questions.module';
import { JwtModule } from '@nestjs/jwt';

import { JwtStrategy } from '@app/common/strategies/jwt.strategie';
import { PostModule } from './content/post.module';

@Module({
  imports: [
    KafkaModule.forRoot({
      clientId: 'social-service',
      brokers: [process.env.KAFKA_BROKER!],
      groupId: 'social-consumer',
    }),
    DatabaseModule,
    QuestionsModule,
    PostModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET,
    }),
  ],
  controllers: [SocialServiceController],
  providers: [SocialServiceService, JwtStrategy],
})
export class SocialServiceModule {}
