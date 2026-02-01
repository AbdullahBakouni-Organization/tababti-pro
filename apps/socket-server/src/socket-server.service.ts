import { Injectable } from '@nestjs/common';

@Injectable()
export class SocketServerService {
  getHello(): string {
    return 'Hello World!';
  }
}
