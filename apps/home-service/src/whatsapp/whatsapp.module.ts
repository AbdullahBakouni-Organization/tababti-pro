import { Module } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappConsumer } from './whatsapp.consumer';
import { KafkaModule } from '@app/common/kafka/kafka.module';

@Module({
  imports: [KafkaModule],
  providers: [WhatsappService, WhatsappConsumer],
  controllers: [WhatsappConsumer, WhatsappController],
  exports: [WhatsappService],
})
export class WhatsappModule {}

/////////////////////////////
/////////////////////
