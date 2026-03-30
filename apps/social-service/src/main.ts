import mongoose from 'mongoose';
import { NestFactory } from '@nestjs/core';
import { SocialServiceModule } from './social-service.module';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { ValidationPipe, Logger } from '@nestjs/common';
import { I18nExceptionFilter } from './common/filters/i18n-exception.filter';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  // ── Mongoose debug logging ────────────────────────────────────────────────
  mongoose.set(
    'debug',
    (collectionName: string, method: string, query: any, doc: any) => {
      logger.debug(
        `MongoDB ${collectionName}.${method} → ${JSON.stringify(query)}${doc ? ' ' + JSON.stringify(doc) : ''}`,
      );
    },
  );

  const app = await NestFactory.create(SocialServiceModule);
  app.enableCors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });
  // ── Global pipes ──────────────────────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // ── Global exception filter ───────────────────────────────────────────────
  // Handles both REST (HTTP) and GraphQL contexts
  app.useGlobalFilters(new I18nExceptionFilter());

  // ── Global prefix (REST only — GraphQL uses /graphql automatically) ───────
  app.setGlobalPrefix('api/v1', {
    exclude: ['graphql'], // ← prevent /api/v1/graphql — keep it at /graphql
  });

  // ── Kafka microservice ────────────────────────────────────────────────────
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.KAFKA,
    options: {
      client: {
        clientId: 'social-service',
        brokers: [process.env.KAFKA_BROKER!],
      },
      consumer: {
        groupId: 'social-consumer',
      },
    },
  });

  await app.startAllMicroservices();

  const port = process.env.SOCIAL_PORT || 3002;
  await app.listen(port);

  logger.log(`🚀 Social Service running on port ${port}`);
  logger.log(`📡 REST   → http://localhost:${port}/api/v1`);
  logger.log(`🔷 GraphQL → http://localhost:${port}/graphql`);
}

void bootstrap();
