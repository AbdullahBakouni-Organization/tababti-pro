import { Injectable } from '@nestjs/common';

@Injectable()
export class HomeServiceService {
  getHello(): string {
    return 'Hello World!';
  }
}
