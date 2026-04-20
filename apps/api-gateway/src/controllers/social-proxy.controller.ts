import { All, Controller, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ProxyService } from '../services/proxy.service';

@Controller('social')
export class SocialProxyController {
  constructor(private readonly proxy: ProxyService) {}

  @All('*')
  async forward(@Req() req: Request, @Res() res: Response) {
    // /nearby fans out to OpenRouteService, which can be slow over
    // low-bandwidth upstream links. Give it more headroom than the 15s default;
    // the service itself enforces an internal best-effort budget.
    const isNearby = req.url.startsWith('/social/nearby');
    await this.proxy.forward(req, res, {
      target: process.env.SOCIAL_SERVICE_URL ?? '',
      prefix: '/social',
      timeoutMs: isNearby ? 30_000 : undefined,
    });
  }
}
