import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ApiResponse } from '../response/api-response';

type Lang = 'en' | 'ar';

@Catch()
export class I18nExceptionFilter implements ExceptionFilter {
  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const langHeader = request.headers['accept-language'];
    const lang: Lang = langHeader === 'ar' ? 'ar' : 'en';

    let status: number;
    let messageKey: string;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const responseBody = exception.getResponse();

      if (typeof responseBody === 'string') {
        messageKey = responseBody;
      } else if (typeof responseBody === 'object' && responseBody['message']) {
        messageKey = Array.isArray(responseBody['message'])
          ? responseBody['message'][0]
          : responseBody['message'];
      } else {
        messageKey = 'common.ERROR';
      }
    } else {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      messageKey = 'common.ERROR';
    }

    response.status(status).json(
      ApiResponse.error({
        lang,
        messageKey,
       // statusCode: status,
      }),
    );
  }
}
