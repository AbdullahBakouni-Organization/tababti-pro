import { Injectable } from '@nestjs/common';

@Injectable()
export class SocialServiceService {
  getHello(): string {
    return 'Hello World!';
  }
}
