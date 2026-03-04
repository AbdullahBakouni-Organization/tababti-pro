import { Module } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappGateway } from './whatsapp.gateway';
import { WhatsappConsumer } from './whatsapp.consumer';
import { KafkaModule } from '@app/common/kafka/kafka.module';

@Module({
  imports: [KafkaModule],
  providers: [WhatsappService, WhatsappGateway],
  controllers: [WhatsappController, WhatsappConsumer],
  exports: [WhatsappService],
})
export class WhatsappModule {}
