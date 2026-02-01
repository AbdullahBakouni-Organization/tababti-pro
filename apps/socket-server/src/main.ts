import { NestFactory } from '@nestjs/core';
import { SocketServerModule } from './socket-server.module';

async function bootstrap() {
  const app = await NestFactory.create(SocketServerModule);
  await app.listen(process.env.port ?? 3000);
}
bootstrap();
