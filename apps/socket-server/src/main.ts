// import 'dotenv/config';
// import { NestFactory } from '@nestjs/core';
// import { SocketServerModule } from './socket-server.module';
// import { MicroserviceOptions, Transport } from '@nestjs/microservices';
// import { Logger } from '@nestjs/common';

// async function bootstrap() {
//   const app = await NestFactory.create(SocketServerModule);
//   const logger = new Logger('Bootstrap');
//   // Enable CORS
//   app.enableCors({
//     origin: '*', // Configure properly in production
//     credentials: true,
//   });

//   app.connectMicroservice<MicroserviceOptions>({
//     transport: Transport.KAFKA,
//     options: {
//       client: {
//         clientId: 'socket-service',
//         brokers: [process.env.KAFKA_BROKER!],
//       },
//       consumer: {
//         groupId: 'socket-consumer',
//       },
//     },
//   });

//   await app.startAllMicroservices();
//   await app.listen(process.env.SOCKET_PORT!);

//   logger.log(`🚀 Socket Service running on port ${process.env.SOCKET_PORT}`);
//   logger.log(
//     `📡 WebSocket available at ws://localhost:${process.env.SOCKET_PORT}/admin`,
//   );
// }
// bootstrap();

import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { SocketServerModule } from './socket-server.module';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { Logger } from '@nestjs/common';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';

async function bootstrap() {
  const app = await NestFactory.create(SocketServerModule);
  const logger = new Logger('Bootstrap');

  // ✅ Explicit Socket.IO adapter (important for future Fastify / scaling)
  app.useWebSocketAdapter(new IoAdapter(app));

  // ✅ Enable CORS
  app.enableCors({
    origin: '*',
    credentials: true,
  });

  // ✅ Kafka microservice
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.KAFKA,
    options: {
      client: {
        clientId: 'socket-service',
        brokers: [process.env.KAFKA_BROKER!],
      },
      consumer: {
        groupId: 'socket-consumer',
      },
    },
  });

  await app.startAllMicroservices();
  await app.listen(process.env.PORT_SOCKET!);

  logger.log(`🚀 Socket service running on port ${process.env.PORT_SOCKET}`);
  logger.log(
    `📡 Socket.IO Admin namespace: http://localhost:${process.env.PORT_SOCKET}/admin`,
  );
}

bootstrap();
