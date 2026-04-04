import { Controller, All, Logger, Req, Res } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import type { Request, Response } from 'express';
import { firstValueFrom } from 'rxjs';
import { AxiosRequestConfig } from 'axios';

@Controller('booking')
export class BookingProxyController {
  private readonly logger = new Logger(BookingProxyController.name);
  constructor(private readonly httpService: HttpService) {}

  @All('*')
  async proxy(@Req() req: Request, @Res() res: Response) {
    const path = req.url.replace(/^\/booking\/?/, '');
    const bookingServiceUrl = `${process.env.BOOKING_SERVICE_URL}`;

    if (!bookingServiceUrl) {
      return res.status(500).json({
        message: 'BOOKING_SERVICE_URL not configured',
      });
    }

    const url = `${bookingServiceUrl}/${path}`;
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

      res.status(response.status).json(response.data);
    } catch (error) {
      const err = error as {
        message: string;
        response?: { status: number; data: unknown };
      };
      this.logger.error(`Proxy error: ${err.message}`, err.response?.data);
      const status = err.response?.status ?? 500;
      const data = err.response?.data ?? {
        message: 'Service unavailable',
        error: err.message,
      };
      res.status(status).json(data);
    }
  }
}
