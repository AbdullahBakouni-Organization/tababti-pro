// import 'dotenv/config'; // Load env first
// import { Module } from '@nestjs/common';
// import { BookingController } from './booking-service.controller';
// import { BookingService } from './booking-service.service';
// import { DatabaseModule } from '@app/common/database/database.module';
// import { KafkaModule } from '@app/common/kafka/kafka.module';
// import { SlotModule } from './slot/slot.module';
// import { CacheModule } from '@app/common/cache/cache.module';
// import { ConfigModule, ConfigService } from '@nestjs/config';
// import { BullModule } from '@nestjs/bull';
// import { UsersService } from 'apps/home-service/src/users/users.service';
// import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
// import { APP_GUARD } from '@nestjs/core';

// @Module({
//   imports: [
//     ThrottlerModule.forRoot([
//       {
//         ttl: 60,
//         limit: 5,
//       },
//     ]),
//     ConfigModule.forRoot({
//       isGlobal: true,
//     }),
//     BullModule.forRootAsync({
//       imports: [ConfigModule],
//       useFactory: (configService: ConfigService) => ({
//         redis: {
//           host: configService.get('REDIS_HOST', 'localhost'),
//           port: configService.get('REDIS_PORT', 6379),
//           password: configService.get('REDIS_PASSWORD'),
//           db: configService.get('REDIS_DB', 0),
//           maxRetriesPerRequest: null, // Important for Bull
//           enableReadyCheck: false,
//         },
//         defaultJobOptions: {
//           removeOnComplete: true,
//           removeOnFail: false,
//         },
//       }),
//       inject: [ConfigService],
//     }),
//     KafkaModule.forProducer({
//       clientId: 'booking-service-producer',
//       brokers: [process.env.KAFKA_BROKER!],
//       groupId: 'booking-consumer',
//     }),

//     // ✅ ADD THIS: Consumer for receiving events
//     KafkaModule.forConsumer({
//       clientId: 'booking-service-consumer',
//       brokers: [process.env.KAFKA_BROKER!],
//       groupId: 'booking-service-group', // Important: Consumer group ID
//     }),

//     DatabaseModule,
//     CacheModule,

//     // ✅ ADD THIS: Import SlotModule which contains SlotGenerationService
//     SlotModule,
//   ],
//   controllers: [BookingController],
//   providers: [
//     BookingService,
//     UsersService,
//     {
//       provide: APP_GUARD,
//       useClass: ThrottlerGuard,
//     },
//   ],
// })
// export class BookingServiceModule {}

// import 'dotenv/config'; // Load env first
// import { Module } from '@nestjs/common';
// import { BookingController } from './booking-service.controller';
// import { BookingService } from './booking-service.service';
// import { DatabaseModule } from '@app/common/database/database.module';
// import { KafkaModule } from '@app/common/kafka/kafka.module';
// import { SlotModule } from './slot/slot.module';
// import { CacheModule } from '@app/common/cache/cache.module';
// import { ConfigModule, ConfigService } from '@nestjs/config';
// import { BullModule } from '@nestjs/bull';
// import { UsersService } from 'apps/home-service/src/users/users.service';
// import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
// import { APP_GUARD } from '@nestjs/core';

// @Module({
//   imports: [
//     ThrottlerModule.forRoot([
//       {
//         ttl: 60,
//         limit: 5,
//       },
//     ]),
//     ConfigModule.forRoot({
//       isGlobal: true,
//     }),
//     BullModule.forRootAsync({
//       imports: [ConfigModule],
//       useFactory: (configService: ConfigService) => ({
//         redis: {
//           host: configService.get('REDIS_HOST', 'localhost'),
//           port: configService.get('REDIS_PORT', 6379),
//           password: configService.get('REDIS_PASSWORD'),
//           db: configService.get('REDIS_DB', 0),
//           maxRetriesPerRequest: null, // Important for Bull
//           enableReadyCheck: false,
//         },
//         defaultJobOptions: {
//           removeOnComplete: true,
//           removeOnFail: false,
//         },
//       }),
//       inject: [ConfigService],
//     }),
//     KafkaModule.forProducer({
//       clientId: 'booking-service-producer',
//       brokers: [process.env.KAFKA_BROKER!],
//       groupId: 'booking-consumer',
//     }),

//     // ✅ ADD THIS: Consumer for receiving events
//     KafkaModule.forConsumer({
//       clientId: 'booking-service-consumer',
//       brokers: [process.env.KAFKA_BROKER!],
//       groupId: 'booking-service-group', // Important: Consumer group ID
//     }),

//     DatabaseModule,
//     CacheModule,

//     // ✅ ADD THIS: Import SlotModule which contains SlotGenerationService
//     SlotModule,
//   ],
//   controllers: [BookingController],
//   providers: [
//     BookingService,
//     UsersService,
//     {
//       provide: APP_GUARD,
//       useClass: ThrottlerGuard,
//     },
//   ],
// })
// export class BookingServiceModule {}

import 'dotenv/config';
import { MiddlewareConsumer, Module } from '@nestjs/common';
import { BookingController } from './booking-service.controller';
import { BookingService } from './booking-service.service';
import { DatabaseModule } from '@app/common/database/database.module';
import { KafkaModule } from '@app/common/kafka/kafka.module';
import { SlotModule } from './slot/slot.module';
import { CacheModule } from '@app/common/cache/cache.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bull';
import { UsersService } from 'apps/home-service/src/users/users.service';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { AuthValidateModule } from '@app/common/auth-validate';
import { JwtUserStrategy } from '@app/common/strategies/jwt.strategie';
import { LangModule } from '@app/common/lang/lang.module';
import { LangMiddleware } from '@app/common/middlewares/lang.middleware';

@Module({
  imports: [
    LangModule,
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PassportModule.register({ defaultStrategy: 'jwt-user' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_ACCESS_SECRET', 'supersecret'),
      }),
      inject: [ConfigService],
    }),
    AuthValidateModule,
    ThrottlerModule.forRoot([
      {
        ttl: 60,
        limit: 5,
      },
    ]),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        redis: {
          host: configService.get('REDIS_HOST', 'localhost'),
          port: configService.get('REDIS_PORT', 6379),
          password: configService.get('REDIS_PASSWORD'),
          db: configService.get('REDIS_DB', 0),
          maxRetriesPerRequest: null,
          enableReadyCheck: false,
        },
        defaultJobOptions: {
          removeOnComplete: true,
          removeOnFail: false,
        },
      }),
      inject: [ConfigService],
    }),
    KafkaModule.forProducer({
      clientId: 'booking-service-producer',
      brokers: [process.env.KAFKA_BROKER!],
      groupId: 'booking-consumer',
    }),
    KafkaModule.forConsumer({
      clientId: 'booking-service-consumer',
      brokers: [process.env.KAFKA_BROKER!],
      groupId: 'booking-service-group',
    }),
    DatabaseModule,
    CacheModule,
    SlotModule,
  ],
  controllers: [BookingController],
  providers: [
    BookingService,
    UsersService,
    JwtUserStrategy,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class BookingServiceModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LangMiddleware).forRoutes('*');
  }
}
