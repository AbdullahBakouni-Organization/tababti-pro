import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { randomUUID } from 'crypto';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    const requestId = randomUUID(); // trace ID so you can find it in logs
    const timestamp = new Date().toISOString();

    // ── Determine status code ──────────────────────────────────────────────
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    // ── Extract a safe message for the client ──────────────────────────────
    let clientMessage: string | string[] = 'Internal server error';

    if (exception instanceof HttpException) {
      const exResponse = exception.getResponse();

      // NestJS validation errors return an object with a message array
      if (typeof exResponse === 'object' && 'message' in exResponse) {
        clientMessage = (exResponse as any).message; // safe — came from ValidationPipe
      } else if (typeof exResponse === 'string') {
        clientMessage = exResponse;
      }
    }
    // For non-HttpException (DB errors, service crashes, etc.)
    // clientMessage stays as 'Internal server error' — never expose internals

    // ── Log the real error server-side with the trace ID ──────────────────
    this.logger.error({
      requestId,
      method: request.method,
      url: request.url,
      status,
      error:
        exception instanceof Error
          ? {
              name: exception.name,
              message: exception.message,
              stack: exception.stack,
            }
          : exception,
    });

    // ── Send safe response to client ──────────────────────────────────────
    response.status(status).json({
      statusCode: status,
      message: clientMessage,
      requestId, // client can share this ID with you for debugging
      timestamp,
      path: request.url,
    });
  }
}
