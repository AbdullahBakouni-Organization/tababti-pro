import 'dotenv/config'; // Load env first
import { Module } from '@nestjs/common';
import { HomeServiceController } from './home-service.controller';
import { HomeServiceService } from './home-service.service';
import { DatabaseModule } from '@app/common/database/database.module';
import { KafkaModule } from '@app/common/kafka/kafka.module';
import { AuthModule } from './auth/auth.module';
import { SmsModule } from './sms/sms.module';
import { DoctorModule } from './doctor/doctor.module';

@Module({
  imports: [
    KafkaModule.forRoot({
      clientId: 'home-service',
      brokers: [process.env.KAFKA_BROKER!],
      groupId: 'home-consumer',
    }),
    DatabaseModule,
    AuthModule,
    SmsModule,
    DoctorModule,
  ],
  controllers: [HomeServiceController],
  providers: [HomeServiceService],
})
export class HomeServiceModule {}
