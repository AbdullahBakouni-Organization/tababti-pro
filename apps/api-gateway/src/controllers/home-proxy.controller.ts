import { Controller, All, Req, Res } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import type { Request, Response } from 'express';
import { firstValueFrom } from 'rxjs';
import { AxiosRequestConfig } from 'axios';

@Controller('home')
export class HomeProxyController {
  constructor(private readonly httpService: HttpService) {}

  @All('*')
  async proxy(@Req() req: Request, @Res() res: Response) {
    const path = req.url.replace(/^\/home\/?/, '');
    const homeServiceUrl = `${process.env.HOME_SERVICE_URL}`;

    if (!homeServiceUrl) {
      return res.status(500).json({
        message: 'HOME_SERVICE_URL not configured',
      });
    }

    const url = `${homeServiceUrl}/${path}`;
    const isMultipart = req.headers['content-type']?.includes(
      'multipart/form-data',
    );

    try {
      const config: AxiosRequestConfig = {
        method: req.method,
        url,
        headers: {
          ...req.headers,
          host: undefined,
          'content-length': undefined,
          // Keep content-type for multipart
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        validateStatus: () => true,
      };

      // ✅ For multipart/form-data, pipe the raw request
      if (isMultipart) {
        config.data = req; // Pass the raw request stream
      } else {
        config.data = req.body;
      }

      const response = await firstValueFrom(this.httpService.request(config));

      const setCookieHeader = response.headers['set-cookie'];
      if (setCookieHeader) {
        res.setHeader('Set-Cookie', setCookieHeader);
      }

      res.status(response.status).json(response.data);
    } catch (error) {
      console.error('Proxy error:', error.message);
      console.error('Error details:', error.response?.data);
      const status = error.response?.status || 500;
      const data = error.response?.data || {
        message: 'Service unavailable',
        error: error.message,
      };
      res.status(status).json(data);
    }
  }
}
