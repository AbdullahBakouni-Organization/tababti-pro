import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { GqlArgumentsHost, GqlContextType } from '@nestjs/graphql';
import { GraphQLError } from 'graphql';
import { Request, Response } from 'express';
import { ApiResponse } from '../response/api-response';

@Catch()
export class I18nExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(I18nExceptionFilter.name);

  catch(exception: any, host: ArgumentsHost) {
    const contextType = host.getType<GqlContextType>();

    if (contextType === 'graphql') {
      return this.handleGraphQL(exception, host);
    }

    return this.handleHttp(exception, host);
  }

  // ── GraphQL ───────────────────────────────────────────────────────────────

  private handleGraphQL(exception: any, host: ArgumentsHost) {
    const gqlHost = GqlArgumentsHost.create(host);
    const ctx = gqlHost.getContext<{ req: Request }>();

    const lang: 'en' | 'ar' =
      ctx?.req?.headers?.['accept-language'] === 'ar' ? 'ar' : 'en';

    // Log the real underlying error — always visible in NestJS console
    this.logger.error(
      `[GraphQL] ${exception?.constructor?.name}: ${exception?.message}`,
      exception?.stack,
    );

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const messageKey = this.extractMessage(exception);

    // Resolve translated message from messages.ts
    const translatedMessage = ApiResponse.getMessage(lang, messageKey);

    throw new GraphQLError(translatedMessage, {
      extensions: {
        code: this.statusToCode(status),
        statusCode: status,
        messageKey, // original key e.g. "doctor.NOT_FOUND" — useful for frontend
      },
    });
  }

  // ── HTTP (REST) ───────────────────────────────────────────────────────────

  private handleHttp(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const lang: 'en' | 'ar' =
      request?.headers?.['accept-language'] === 'ar' ? 'ar' : 'en';

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const message = this.extractMessage(exception);

      return response
        .status(status)
        .json(ApiResponse.error({ lang, messageKey: message }));
    }

    this.logger.error(
      `[HTTP] Unexpected error: ${exception?.message}`,
      exception?.stack,
    );

    return response
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .json(ApiResponse.error({ lang, messageKey: 'common.ERROR' }));
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private extractMessage(exception: any): string {
    if (exception instanceof HttpException) {
      const res: any = exception.getResponse();
      if (typeof res === 'string') return res;
      if (Array.isArray(res?.message)) return res.message[0];
      if (typeof res?.message === 'string') return res.message;
    }
    return exception?.message ?? 'common.ERROR';
  }

  private statusToCode(status: number): string {
    const map: Record<number, string> = {
      400: 'BAD_REQUEST',
      401: 'UNAUTHENTICATED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      409: 'CONFLICT',
      422: 'UNPROCESSABLE',
      500: 'INTERNAL_SERVER_ERROR',
    };
    return map[status] ?? 'INTERNAL_SERVER_ERROR';
  }
}
