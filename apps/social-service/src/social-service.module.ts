import {
  MiddlewareConsumer,
  Module,
  NestModule,
  Post,
  RequestMethod,
} from '@nestjs/common';
import { SocialServiceController } from './social-service.controller';
import { SocialServiceService } from './social-service.service';
import { KafkaModule } from '@app/common/kafka/kafka.module';
import { DatabaseModule } from '@app/common/database/database.module';
import { QuestionsModule } from './questions/questions.module';
import { JwtModule } from '@nestjs/jwt';
import { AuthValidateModule } from '@app/common/auth-validate';
import { PostModule } from './content/post.module';
import { SearchModule } from './search/search.module';
import { SearchCountMiddleware } from './search/search-count.middleware';
import { NearbyBookingController } from './most-searched_nearby-booking/nearby-booking.controller';
import { NearbyBookingService } from './most-searched_nearby-booking/nearby-booking.service';
import { DoctorProfileModule } from './doctor-profile/doctor-profile.module';

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
    PostModule,
    SearchModule,
    DoctorProfileModule,

    JwtModule.register({
      secret: process.env.JWT_ACCESS_SECRET,
    }),
  ],
  controllers: [SocialServiceController, NearbyBookingController],
  providers: [SocialServiceService, NearbyBookingService],
})
export class SocialServiceModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(SearchCountMiddleware)
      .forRoutes({ path: 'search', method: RequestMethod.GET });
  }
}
