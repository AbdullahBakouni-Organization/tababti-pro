import {
  Injectable,
  Logger,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { unlinkSync, existsSync } from 'fs';

@Injectable()
export class FileCleanupInterceptor implements NestInterceptor {
  private readonly logger = new Logger(FileCleanupInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();

    return next.handle().pipe(
      catchError((error) => {
        const file = request.file as { path?: string } | undefined;

        if (file?.path && existsSync(file.path)) {
          try {
            unlinkSync(file.path);
          } catch (err) {
            this.logger.error('Failed to delete temporary file', err);
          }
        }

        return throwError(() => error);
      }),
    );
  }
}
