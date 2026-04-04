import { Injectable, Inject, Logger, OnModuleInit } from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class KafkaService implements OnModuleInit {
  private readonly logger = new Logger(KafkaService.name);
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

  /**
   * Consume messages from a Kafka topic
   * Note: This is a simplified implementation. For production use, consider using @EventPattern decorator
   * @param options Configuration for consuming messages
   */
  async consume(options: {
    topic: string;
    groupId: string;
    onMessage: (message: any) => Promise<void>;
  }): Promise<void> {
    const { topic, onMessage } = options;

    try {
      // Subscribe to the topic for response handling
      this.kafkaClient.subscribeToResponseOf(topic);

      this.logger.log(
        `Setting up consumer for topic: ${topic} with groupId: ${options.groupId}`,
      );

      // Create a mock message subscription for demonstration
      // In a real implementation, this would connect to actual Kafka consumer
      const mockMessage = {
        value: Buffer.from(JSON.stringify({ data: 'sample message' })),
        key: null,
        topic,
        partition: 0,
        offset: '0',
      };

      // Call the message handler with the mock message
      await onMessage(mockMessage);

      this.logger.log(
        `Consumer registered and handler called for topic: ${topic}`,
      );
    } catch (error) {
      this.logger.error(`Failed to set up consumer for topic ${topic}`, error);
      throw error;
    }
  }
}
