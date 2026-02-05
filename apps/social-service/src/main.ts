import { NestFactory } from '@nestjs/core';
import { SocialServiceModule } from './social-service.module';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { ValidationPipe } from '@nestjs/common';
import { I18nExceptionFilter } from './common/filters/i18n-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(SocialServiceModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Global Exception Filter (i18n)
  app.useGlobalFilters(new I18nExceptionFilter());

  app.setGlobalPrefix('api/v1');

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
  await app.listen(process.env.SOCIAL_PORT || 3001);

  console.log(
    `Social Service running on port ${process.env.SOCIAL_PORT || 3001}`,
  );
}
bootstrap();
