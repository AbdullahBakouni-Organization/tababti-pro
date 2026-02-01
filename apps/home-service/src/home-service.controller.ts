import { Controller, Get } from '@nestjs/common';
import { HomeServiceService } from './home-service.service';

@Controller()
export class HomeServiceController {
  constructor(private readonly homeServiceService: HomeServiceService) {}

  @Get()
  getHello(): string {
    return this.homeServiceService.getHello();
  }
}
