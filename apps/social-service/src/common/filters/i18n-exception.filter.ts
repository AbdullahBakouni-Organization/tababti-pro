import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ApiResponse } from '../response/api-response';

type Lang = 'en' | 'ar';

@Catch()
export class I18nExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(I18nExceptionFilter.name);

  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const langHeader = request.headers['accept-language'];
    const lang: Lang = langHeader === 'ar' ? 'ar' : 'en';

    let status: number;
    let messageKey: string;
    let details: any = null;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const responseBody = exception.getResponse();

      if (typeof responseBody === 'string') {
        messageKey = responseBody;
      } else if (typeof responseBody === 'object' && responseBody['message']) {
        messageKey = Array.isArray(responseBody['message'])
          ? responseBody['message'][0]
          : responseBody['message'];
        details = responseBody;
      } else {
        messageKey = 'common.ERROR';
      }
    } else {
      status = HttpStatus.INTERNAL_SERVER_ERROR;

      details = exception.stack || exception.message || exception;

      messageKey =
        details.toString().length > 200
          ? 'Internal server error. See server logs for details.'
          : details.toString();
    }

    // سجل التفاصيل كاملة في السيرفر
    this.logger.error(`❌ ${messageKey}`, details);

    // رد المستخدم بالـ API
    response.status(status).json({
      success: false,
      message: messageKey,
      data: null,
    });
  }
}
