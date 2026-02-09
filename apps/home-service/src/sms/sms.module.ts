import { Module } from '@nestjs/common';
import { SmsService } from './sms.service';
import { KafkaModule } from '@app/common/kafka/kafka.module';
import { SmsConsumerController } from './sms-consumer.service';

@Module({
  imports: [KafkaModule],
  controllers: [SmsConsumerController],
  providers: [SmsService],
  exports: [SmsService],
})
export class SmsModule {}
