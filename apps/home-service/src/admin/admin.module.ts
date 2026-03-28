import { Module } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { DatabaseModule } from '@app/common/database/database.module';

import { AuthModule } from '../auth/auth.module';
import { AuthValidateModule } from '@app/common/auth-validate';
import { KafkaModule } from '@app/common/kafka/kafka.module';
import { MinioModule } from '../minio/minio.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    AuthValidateModule,
    KafkaModule,
    MinioModule,
    WhatsappModule,
  ],
  providers: [AdminService],
  controllers: [AdminController],
})
export class AdminModule {}
