import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { HomeServiceModule } from './home-service.module';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import {
  configureStaticFiles,
  fileAccessMiddleware,
} from './config/static-files.config';

async function bootstrap() {
  const app =
    await NestFactory.create<NestExpressApplication>(HomeServiceModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.setGlobalPrefix('api/v1');

  configureStaticFiles(app);
  app.use('/uploads', fileAccessMiddleware);

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.KAFKA,
    options: {
      client: {
        clientId: 'home-consumer',
        brokers: [process.env.KAFKA_BROKER!],
      },
      consumer: {
        groupId: 'home-consumer',
      },
    },
  });

  await app.startAllMicroservices();
  await app.listen(process.env.HOME_PORT || 3001);

  console.log(`home Service running on port ${process.env.HOME_PORT || 3001}`);
}
bootstrap();
