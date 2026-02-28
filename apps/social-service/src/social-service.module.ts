import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { join } from 'path';

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
import { NearbyBookingModule } from './most-searched_nearby-booking/nearby-booking.module';
import { DoctorProfileModule } from './doctor-profile/doctor-profile.module';
import { DashboardModule } from './dashboard/dashboard.module';

// NOTE: NearbyBookingModule likely also uses 'route-processing' / 'matrix-processing'.
// If so, those queues are already owned by SearchModule (which is global enough
// via DatabaseModule).  If NearbyBookingModule is *not* a child of SearchModule,
// add BullModule.registerQueue() calls inside NearbyBookingModule as well, or
// move queue registration to a shared QueuesModule and import it in both.

@Module({
  imports: [
    // ── GraphQL ────────────────────────────────────────────────────────────
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile: join(process.cwd(), 'src/schema.gql'),
      sortSchema: true,
      playground: process.env.NODE_ENV !== 'production',
      introspection: process.env.NODE_ENV !== 'production',
      context: ({ req }) => ({ req }),
    }),

    // ── Infrastructure ─────────────────────────────────────────────────────
    KafkaModule.forRoot({
      clientId: 'social-service',
      brokers: [process.env.KAFKA_BROKER!],
      groupId: 'social-consumer',
    }),
    DatabaseModule,
    AuthValidateModule,
    JwtModule.register({
      secret: process.env.JWT_ACCESS_SECRET,
    }),

    // ── Feature modules ────────────────────────────────────────────────────
    QuestionsModule,
    PostModule,
    SearchModule, // owns route-processing + matrix-processing queues
    DoctorProfileModule,
    DashboardModule,
    NearbyBookingModule,
  ],
  controllers: [SocialServiceController],
  providers: [SocialServiceService],
})
export class SocialServiceModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(SearchCountMiddleware)
      .forRoutes({ path: 'search', method: RequestMethod.GET });
  }
}
