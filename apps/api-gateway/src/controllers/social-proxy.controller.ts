import { All, Controller, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ProxyService } from '../services/proxy.service';

@Controller('social')
export class SocialProxyController {
  constructor(private readonly proxy: ProxyService) {}

  @All('*')
  async forward(@Req() req: Request, @Res() res: Response) {
    await this.proxy.forward(req, res, {
      target: process.env.SOCIAL_SERVICE_URL ?? '',
      prefix: '/social',
    });
  }
}
