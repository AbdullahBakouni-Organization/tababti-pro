import { Module } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { AdminDoctorController } from './admin-doctor.controller';
import { DatabaseModule } from '@app/common/database/database.module';

import { AuthModule } from '../auth/auth.module';
import { AuthValidateModule } from '@app/common/auth-validate';
import { KafkaModule } from '@app/common/kafka/kafka.module';
import { MinioModule } from '@app/common/file-storage';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { CacheModule } from '@app/common';
import { WorkingHoursModule } from '../working-hours/working-hours.module';

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    AuthValidateModule,
    KafkaModule,
    MinioModule,
    WhatsappModule,
    CacheModule,
    WorkingHoursModule,
  ],
  providers: [AdminService],
  controllers: [AdminController, AdminDoctorController],
})
export class AdminModule {}
