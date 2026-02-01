import { Injectable, Inject, OnModuleInit } from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import { KAFKA_TOPICS } from './events/topics';

@Injectable()
export class KafkaService implements OnModuleInit {
  constructor(
    @Inject('KAFKA_SERVICE') private readonly kafkaClient: ClientKafka,
  ) {}

  async onModuleInit() {
    Object.values(KAFKA_TOPICS).forEach((topic) => {
      this.kafkaClient.subscribeToResponseOf(topic);
    });

    await this.kafkaClient.connect();
  }

  emit(topic: string, data: any) {
    return this.kafkaClient.emit(topic, data);
  }

  send(topic: string, data: any) {
    return this.kafkaClient.send(topic, data);
  }
}
