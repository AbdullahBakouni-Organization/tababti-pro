import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { BookingServiceModule } from './booking-service.module';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const logger = new Logger('BookingServiceBootstrap');

  // Create the main HTTP application
  const app = await NestFactory.create(BookingServiceModule);
  app.enableCors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.setGlobalPrefix('api/v1');
  // Get config service
  const configService = app.get(ConfigService);
  const kafkaBroker = configService.get<string>('KAFKA_BROKER', '');

  // ✅ CRITICAL: Connect Kafka microservice to listen for events
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.KAFKA,
    options: {
      client: {
        clientId: 'booking-service-consumer',
        brokers: [kafkaBroker],
        retry: {
          initialRetryTime: 100,
          retries: 8,
        },
      },
      consumer: {
        groupId: 'booking-service-group', // Must match module config
        allowAutoTopicCreation: true,
        sessionTimeout: 30000,
        heartbeatInterval: 3000,
      },
      subscribe: {
        fromBeginning: false, // Only process new messages
      },
    },
  });

  // ✅ CRITICAL: Start all microservices (this enables Kafka consumer)
  await app.startAllMicroservices();
  logger.log('✅ Kafka consumer connected and listening for events');

  // Start HTTP server (optional, for REST endpoints)
  const port = configService.get<number>('BOOKING_PORT', 3003);
  await app.listen(port);
  logger.log(`✅ HTTP server running on port ${port}`);
}

bootstrap().catch((error) => {
  console.error('❌ Failed to start booking service:', error);
  process.exit(1);
});
