import { Controller, Get } from '@nestjs/common';
import { SocialServiceService } from './social-service.service';

@Controller()
export class SocialServiceController {
  constructor(private readonly socialServiceService: SocialServiceService) {}

  @Get('health')
  getHello(): string {
    return this.socialServiceService.getHello();
  }
}
