import 'dotenv/config'; // Load env first
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

@Module({
  imports: [
    KafkaModule.forProducer({
      clientId: 'home-service',
      brokers: [process.env.KAFKA_BROKER!],
    }),
    DatabaseModule,
    SmsModule,
    // WhatsappModule,//Test Whatsapp api
    DoctorModule,
    AdminModule,
    AuthModule,
    WorkingHoursModule,
  ],
  controllers: [HomeServiceController],
  providers: [HomeServiceService],
})
export class HomeServiceModule {}
