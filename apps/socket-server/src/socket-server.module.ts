import { Module } from '@nestjs/common';
import { SocketServerController } from './socket-server.controller';
import { SocketServerService } from './socket-server.service';

@Module({
  imports: [],
  controllers: [SocketServerController],
  providers: [SocketServerService],
})
export class SocketServerModule {}
