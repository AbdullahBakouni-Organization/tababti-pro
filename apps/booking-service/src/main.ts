import { NestFactory } from '@nestjs/core';
import { BookingServiceModule } from './booking-service.module';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(BookingServiceModule);

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
        clientId: 'booking-service',
        brokers: [process.env.KAFKA_BROKER!],
      },
      consumer: {
        groupId: 'booking-consumer',
      },
    },
  });

  await app.startAllMicroservices();
  await app.listen(process.env.BOOKING_PORT || 3003);

  console.log(
    `Booking Service running on port ${process.env.BOOKING_PORT || 3003}`,
  );
}
bootstrap();
