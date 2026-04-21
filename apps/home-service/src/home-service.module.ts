import 'dotenv/config';
import { Module } from '@nestjs/common';
import { HomeServiceController } from './home-service.controller';
import { HomeServiceService } from './home-service.service';
import { DatabaseModule } from '@app/common/database/database.module';
import { KafkaModule } from '@app/common/kafka/kafka.module';
import { WhatsappModule } from './whatsapp/whatsapp.module';
import { SmsModule } from './sms/sms.module';
import { DoctorModule } from './doctor/doctor.module';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { WorkingHoursModule } from './working-hours/working-hours.module';
import { BullModule } from '@nestjs/bull';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { FcmModule } from '@app/common/fcm';
import { UsersModule } from './users/users.module';
import { MinioModule } from '@app/common/file-storage';
import { CacheModule } from '@app/common/cache/cache.module';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import {
  RedisThrottlerStorage,
  ThrottlerStorageModule,
  UserAwareThrottlerGuard,
} from '@app/common';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        redis: {
          host: configService.get('REDIS_HOST', 'localhost'),
          port: configService.get('REDIS_PORT', 6379),
          password: configService.get('REDIS_PASSWORD'),
          db: configService.get('REDIS_DB', 0),
          maxRetriesPerRequest: null, // Important for Bull
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
      clientId: 'home-service-producer',
      brokers: [process.env.KAFKA_BROKER!],
      groupId: 'home-consumer',
    }),

    // ✅ ADD THIS: Consumer for receiving events
    KafkaModule.forConsumer({
      clientId: 'home-service-consumer',
      brokers: [process.env.KAFKA_BROKER!],
      groupId: 'home-service-group', // Important: Consumer group ID
    }),
    // Named throttlers must match the keys referenced by `@Throttle({ short: ... })`
    // / `@Throttle({ long: ... })` decorators across this service. The default
    // (unnamed) throttler stays permissive so un-decorated routes behave as
    // before while OTP endpoints actually enforce their intended burst limits.
    ThrottlerModule.forRootAsync({
      imports: [ThrottlerStorageModule],
      inject: [ConfigService, RedisThrottlerStorage],
      useFactory: (config: ConfigService, storage: RedisThrottlerStorage) => ({
        throttlers: [
          {
            name: 'default',
            ttl: config.get<number>('THROTTLE_DEFAULT_TTL', 60_000), // 60s
            limit: config.get<number>('THROTTLE_DEFAULT_LIMIT', 120),
          },
          {
            name: 'short',
            ttl: config.get<number>('THROTTLE_SHORT_TTL', 1000), // 1s
            limit: config.get<number>('THROTTLE_SHORT_LIMIT', 3),
          },
          {
            name: 'long',
            ttl: config.get<number>('THROTTLE_LONG_TTL', 60_000), // 60s
            limit: config.get<number>('THROTTLE_LONG_LIMIT', 100),
          },
        ],
        storage,
      }),
    }),
    DatabaseModule,
    SmsModule,
    WhatsappModule,
    WorkingHoursModule,
    DoctorModule,
    AdminModule,
    AuthModule,
    FcmModule,
    UsersModule,
    MinioModule,
    CacheModule,
  ],
  controllers: [HomeServiceController],
  providers: [
    HomeServiceService,
    {
      provide: APP_GUARD,
      useClass: UserAwareThrottlerGuard,
    },
  ],
})
export class HomeServiceModule {}
