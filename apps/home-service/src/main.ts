// import 'dotenv/config';
// import { NestFactory } from '@nestjs/core';
// import { HomeServiceModule } from './home-service.module';
// import { MicroserviceOptions, Transport } from '@nestjs/microservices';
// import { ValidationPipe } from '@nestjs/common';
// import { NestExpressApplication } from '@nestjs/platform-express';
// import cookieParser from 'cookie-parser';
// import {
//   configureStaticFiles,
//   fileAccessMiddleware,
// } from './config/static-files.config';

// async function bootstrap() {
//   const app =
//     await NestFactory.create<NestExpressApplication>(HomeServiceModule);

//   app.useGlobalPipes(
//     new ValidationPipe({
//       whitelist: true,
//       forbidNonWhitelisted: true,
//       transform: true,
//     }),
//   );

//   app.setGlobalPrefix('api/v1');
//   app.use(cookieParser());
//   // Configure static file serving for uploaded documents
//   configureStaticFiles(app);
//   app.use('/uploads', fileAccessMiddleware);

//   app.connectMicroservice<MicroserviceOptions>({
//     transport: Transport.KAFKA,
//     options: {
//       client: {
//         clientId: 'home-consumer',
//         brokers: [process.env.KAFKA_BROKER!],
//       },
//       consumer: {
//         groupId: 'home-consumer',
//       },
//     },
//   });

//   await app.startAllMicroservices();
//   await app.listen(process.env.PORT_HOME!);

//   console.log(`home Service running on port ${process.env.PORT_HOME}`);
// }
// bootstrap();

import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { HomeServiceModule } from './home-service.module';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';

async function bootstrap() {
  const logger = new Logger('HomeServiceBootstrap');

  // Create the main HTTP application
  const app = await NestFactory.create(HomeServiceModule);
  app.use(cookieParser());

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
        clientId: 'home-service-consumer',
        brokers: [kafkaBroker],
        retry: {
          initialRetryTime: 100,
          retries: 8,
        },
      },
      consumer: {
        groupId: 'home-service-group', // Must match module config
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
  const port = configService.get<number>('HOME_PORT', 3001);
  await app.listen(port);
  logger.log(`✅ HTTP server running on port ${port}`);
}

bootstrap().catch((error) => {
  console.error('❌ Failed to start home service:', error);
  process.exit(1);
});
