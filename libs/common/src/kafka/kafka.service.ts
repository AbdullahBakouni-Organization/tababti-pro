import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class KafkaService implements OnModuleInit {
  constructor(
    @Inject('KAFKA_SERVICE') private readonly kafkaClient: ClientKafka,
  ) {}

  async onModuleInit() {
    await this.kafkaClient.connect();
  }

  emit(topic: string, data: any) {
    this.kafkaClient.emit(topic, data);
  }

  async send(topic: string, data: any): Promise<any> {
    return await firstValueFrom(this.kafkaClient.send(topic, data));
  }

  subscribeToTopic(topic: string): void {
    this.kafkaClient.subscribeToResponseOf(topic);
  }
}
