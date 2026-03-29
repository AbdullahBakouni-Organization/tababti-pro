import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { DatabaseModule } from '@app/common/database/database.module';
import { SmsService } from '../sms/sms.service';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { AuthValidateModule } from '@app/common/auth-validate';
import { MinioModule } from '@app/common/file-storage';
@Module({
  imports: [DatabaseModule, AuthValidateModule, WhatsappModule, MinioModule],
  providers: [AuthService, SmsService],
  controllers: [AuthController],
  exports: [AuthService],
})
export class AuthModule {}
