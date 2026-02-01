import { NestFactory } from '@nestjs/core';
import { NotificationServiceModule } from './notification-service.module';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { ValidationPipe } from '@nestjs/common';
async function bootstrap() {
  const app = await NestFactory.create(NotificationServiceModule);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.setGlobalPrefix('api/v1');

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.KAFKA,
    options: {
      client: {
        clientId: 'notification-service',
        brokers: [process.env.KAFKA_BROKER!],
      },
      consumer: {
        groupId: 'notification-consumer',
      },
    },
  });

  await app.startAllMicroservices();
  await app.listen(process.env.NOTIFICATION_PORT || 3001);

  console.log(
    `Notification Service running on port ${process.env.NOTIFICATION_PORT || 3002}`,
  );
}
bootstrap();
