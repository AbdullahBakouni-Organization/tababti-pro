import { All, Controller, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ProxyService } from '../services/proxy.service';

@Controller('notification')
export class NotificationProxyController {
  constructor(private readonly proxy: ProxyService) {}

  @All('*')
  async forward(@Req() req: Request, @Res() res: Response) {
    await this.proxy.forward(req, res, {
      target: process.env.NOTIFICATION_SERVICE_URL ?? '',
      prefix: '/notification',
    });
  }
}
