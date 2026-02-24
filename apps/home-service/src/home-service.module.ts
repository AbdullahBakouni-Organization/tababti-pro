import 'dotenv/config';
import { Module } from '@nestjs/common';
import { HomeServiceController } from './home-service.controller';
import { HomeServiceService } from './home-service.service';
import { DatabaseModule } from '@app/common/database/database.module';
import { KafkaModule } from '@app/common/kafka/kafka.module';
// import { AuthModule } from './auth/auth.module';
import { SmsModule } from './sms/sms.module';
import { DoctorModule } from './doctor/doctor.module';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { WorkingHoursModule } from './working-hours/working-hours.module';
import { BullModule } from '@nestjs/bull';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { FcmModule } from './fcm/fcm.module';

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
    DatabaseModule,
    SmsModule,
    // WhatsappModule,//Test Whatsapp api
    WorkingHoursModule,
    DoctorModule,
    AdminModule,
    AuthModule,
    FcmModule,
  ],
  controllers: [HomeServiceController],
  providers: [HomeServiceService],
})
export class HomeServiceModule {}
