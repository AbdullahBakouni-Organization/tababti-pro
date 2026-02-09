import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ApiResponse } from '../response/api-response';

@Catch()
export class I18nExceptionFilter implements ExceptionFilter {
  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const lang: 'en' | 'ar' =
      request.headers['accept-language'] === 'ar' ? 'ar' : 'en';

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const res: any = exception.getResponse();
      const message =
        typeof res === 'string'
          ? res
          : Array.isArray(res['message'])
            ? res['message'][0]
            : res['message'] || 'common.ERROR';

      return response.status(status).json(
        ApiResponse.error({
          lang,
          messageKey: message,
        }),
      );
    }

    console.error('Unexpected error:', exception);
    return response.status(HttpStatus.INTERNAL_SERVER_ERROR).json(
      ApiResponse.error({
        lang,
        messageKey: 'common.ERROR',
      }),
    );
  }
}
