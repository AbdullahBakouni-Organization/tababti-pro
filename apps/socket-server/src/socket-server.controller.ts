import { Controller, Get } from '@nestjs/common';
import { SocketServerService } from './socket-server.service';

@Controller()
export class SocketServerController {
  constructor(private readonly socketServerService: SocketServerService) {}
}
