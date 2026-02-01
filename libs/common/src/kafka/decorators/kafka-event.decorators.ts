import { applyDecorators } from '@nestjs/common';
import { EventPattern } from '@nestjs/microservices';

export function KafkaEvent(topic: string) {
  return applyDecorators(EventPattern(topic));
}
