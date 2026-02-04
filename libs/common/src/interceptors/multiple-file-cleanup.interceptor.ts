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
export class MultipleFileCleanupInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();

    return next.handle().pipe(
      catchError((error) => {
        this.cleanupFiles(request);
        return throwError(() => error);
      }),
    );
  }

  private cleanupFiles(request: any): void {
    // Handle single file
    if (request.file?.path) {
      this.deleteFile(request.file.path);
    }

    // Handle multiple files (files array)
    if (request.files && Array.isArray(request.files)) {
      request.files.forEach((file: Express.Multer.File) => {
        if (file.path) {
          this.deleteFile(file.path);
        }
      });
    }

    // Handle multiple files (files object with field names)
    if (request.files && typeof request.files === 'object' && !Array.isArray(request.files)) {
      Object.values(request.files).forEach((fileArray: any) => {
        if (Array.isArray(fileArray)) {
          fileArray.forEach((file: Express.Multer.File) => {
            if (file.path) {
              this.deleteFile(file.path);
            }
          });
        } else if (fileArray?.path) {
          this.deleteFile(fileArray.path);
        }
      });
    }
  }

  private deleteFile(filePath: string): void {
    try {
      if (existsSync(filePath)) {
        unlinkSync(filePath);
        console.log(`Successfully deleted file: ${filePath}`);
      }
    } catch (error) {
      console.error(`Failed to delete file ${filePath}:`, error);
    }
  }
}
