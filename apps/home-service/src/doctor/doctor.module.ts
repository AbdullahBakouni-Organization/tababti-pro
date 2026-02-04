import { Module } from '@nestjs/common';
import { DoctorService } from './doctor.service';
import { DoctorController } from './doctor.controller';
import { AuthValidateModule } from '../../../../libs/common/src/auth-validate/auth-validate.module';
import { KafkaModule } from '../../../../libs/common/src/kafka/kafka.module';
import { DatabaseModule } from '@app/common/database/database.module';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    DatabaseModule,
    AuthValidateModule,
    KafkaModule,
    HttpModule.register({
      timeout: 3000,
    }),
  ],
  providers: [DoctorService],
  controllers: [DoctorController],
})
export class DoctorModule {}
