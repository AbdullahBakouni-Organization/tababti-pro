// import { NestFactory } from '@nestjs/core';
// import { MicroserviceOptions, Transport } from '@nestjs/microservices';
// import { HomeServiceModule } from './home-service.module';
// import { Logger, ValidationPipe } from '@nestjs/common';
// import { ConfigService } from '@nestjs/config';
// import cookieParser from 'cookie-parser';

// async function bootstrap() {
//   const logger = new Logger('HomeServiceBootstrap');

//   // Create the main HTTP application
//   const app = await NestFactory.create(HomeServiceModule);
//   app.use(cookieParser());

//   app.useGlobalPipes(
//     new ValidationPipe({
//       whitelist: true,
//       forbidNonWhitelisted: true,
//       transform: true,
//     }),
//   );
//   app.setGlobalPrefix('api/v1');
//   // Get config service
//   const configService = app.get(ConfigService);
//   const kafkaBroker = configService.get<string>('KAFKA_BROKER', '');

//   // ✅ CRITICAL: Connect Kafka microservice to listen for events
//   app.connectMicroservice<MicroserviceOptions>({
//     transport: Transport.KAFKA,
//     options: {
//       client: {
//         clientId: 'home-service-consumer',
//         brokers: [kafkaBroker],
//         retry: {
//           initialRetryTime: 100,
//           retries: 8,
//         },
//       },
//       consumer: {
//         groupId: 'home-service-group', // Must match module config
//         allowAutoTopicCreation: true,
//         sessionTimeout: 30000,
//         heartbeatInterval: 3000,
//       },
//       subscribe: {
//         fromBeginning: false, // Only process new messages
//       },
//     },
//   });

//   // ✅ CRITICAL: Start all microservices (this enables Kafka consumer)
//   await app.startAllMicroservices();
//   logger.log('✅ Kafka consumer connected and listening for events');

//   // Start HTTP server (optional, for REST endpoints)
//   const port = configService.get<number>('HOME_PORT', 3001);
//   await app.listen(port);
//   logger.log(`✅ HTTP server running on port ${port}`);
// }

// bootstrap().catch((error) => {
//   console.error('❌ Failed to start home service:', error);
//   process.exit(1);
// });

import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { HomeServiceModule } from './home-service.module';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import { I18nExceptionFilter } from '@app/common/filters/i18n-exception.filter';

async function bootstrap() {
  const logger = new Logger('HomeServiceBootstrap');

  const app = await NestFactory.create(HomeServiceModule);
  app.use(cookieParser());

  // ── i18n Exception Filter ─────────────────────────────────────────────────
  // Translates ALL thrown exceptions based on accept-language header.
  // Must be registered BEFORE pipes so it catches validation errors too.
  app.useGlobalFilters(new I18nExceptionFilter());

  // ── Validation Pipe ───────────────────────────────────────────────────────
  // DO NOT use NestJS default ValidationPipe here.
  // I18nValidationPipe is already registered via APP_PIPE in LangModule —
  // it translates class-validator errors using the accept-language header.
  // Adding a second ValidationPipe here would override it and break translation.

  app.setGlobalPrefix('api/v1');

  const configService = app.get(ConfigService);
  const kafkaBroker = configService.get<string>('KAFKA_BROKER', '');

  // ── Kafka microservice ────────────────────────────────────────────────────
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.KAFKA,
    options: {
      client: {
        clientId: 'home-service-consumer',
        brokers: [kafkaBroker],
        retry: {
          initialRetryTime: 100,
          retries: 8,
        },
      },
      consumer: {
        groupId: 'home-service-group',
        allowAutoTopicCreation: true,
        sessionTimeout: 30000,
        heartbeatInterval: 3000,
      },
      subscribe: {
        fromBeginning: false,
      },
    },
  });

  await app.startAllMicroservices();
  logger.log('✅ Kafka consumer connected and listening for events');

  const port = configService.get<number>('HOME_PORT', 3001);
  await app.listen(port);
  logger.log(`✅ HTTP server running on port ${port}`);
}

bootstrap().catch((error) => {
  console.error('❌ Failed to start home service:', error);
  process.exit(1);
});
