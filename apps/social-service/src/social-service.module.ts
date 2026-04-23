import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
//import { GraphQLModule } from '@nestjs/graphql';
// import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
// import { join } from 'path';

import { BullModule } from '@nestjs/bull';

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
//import { DashboardModule } from './dashboard/dashboard.module';
import { RequestsModule } from './medical-equipment/request.module';
import { DashboardModule } from './dashboard-service/dashboard.module';
import { CacheModule } from '@app/common/cache/cache.module';
import { DoctorCacheModule } from './cache-invalidation/doctor-cache.module';

@Module({
  imports: [
    // ── GraphQL ────────────────────────────────────────────────────────────
    // GraphQLModule.forRoot<ApolloDriverConfig>({
    //   driver: ApolloDriver,
    //   autoSchemaFile: join(process.cwd(), 'src/schema.gql'),
    //   sortSchema: true,
    //   playground: process.env.NODE_ENV !== 'production',
    //   introspection: process.env.NODE_ENV !== 'production',
    //   context: ({ req }) => ({ req }),
    // }),

    // ── Infrastructure ─────────────────────────────────────────────────────
    // Bull root config — every BullModule.registerQueue() in the tree binds
    // to the Redis instance configured here. Without this, Bull silently
    // falls back to localhost:6379 and `.add()` rejects in any environment
    // where Redis runs elsewhere (logs: "Matrix queue unavailable").
    BullModule.forRootAsync({
      useFactory: () => ({
        redis: {
          host: process.env.REDIS_HOST ?? 'localhost',
          port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
          password: process.env.REDIS_PASSWORD || undefined,
          db: parseInt(process.env.REDIS_DB ?? '0', 10),
          maxRetriesPerRequest: null,
          enableReadyCheck: false,
        },
        defaultJobOptions: {
          removeOnComplete: true,
          removeOnFail: false,
        },
      }),
    }),
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

    QuestionsModule,
    PostModule,
    SearchModule,
    DoctorProfileModule,
    //DashboardModule,
    DashboardModule,
    NearbyBookingModule,
    RequestsModule,
    CacheModule,
    DoctorCacheModule,
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
