import { Injectable, Inject, OnModuleInit } from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import { KAFKA_TOPICS } from './events/topics';
import { Observable } from 'rxjs';
import { firstValueFrom } from 'rxjs';

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

  emit(topic: string, data: any): Observable<any> {
    return this.kafkaClient.emit(topic, data);
  }

  async send(topic: string, data: any): Promise<any> {
    return await firstValueFrom(this.kafkaClient.send(topic, data));
  }
}
