import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { unlinkSync, existsSync } from 'fs';

@Injectable()
export class FileCleanupInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();

    return next.handle().pipe(
      catchError((error) => {
        const file = request.file; // ✅ read AFTER Multer

        if (file?.path && existsSync(file.path)) {
          try {
            unlinkSync(file.path);
          } catch (err) {
            console.error('Failed to delete file:', err);
          }
        }

        return throwError(() => error);
      }),
    );
  }
}
