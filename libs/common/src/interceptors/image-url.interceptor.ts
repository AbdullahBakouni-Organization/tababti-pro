import 'dotenv/config';
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable()
export class ImageUrlInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const baseUrl = process.env.APP_URL || 'http://localhost:3000';

    return next.handle().pipe(
      map((data) => {
        const result = this.addUrlToData(data, baseUrl);
        return result;
      }),
    );
  }

  private addUrlToData(data: any, baseUrl: string): any {
    if (!data || typeof data !== 'object') return data;

    // Handle Arrays
    if (Array.isArray(data)) {
      return data.map((item) => this.addUrlToData(item, baseUrl));
    }

    // Create a new object to avoid mutation
    const result = { ...data };

    // Logic for the 'image' field
    if (
      result.image &&
      typeof result.image === 'string' &&
      !result.image.startsWith('http')
    ) {
      // Normalize path and add base URL
      const cleanPath = result.image.replace(/\\/g, '/');
      result.image = `${baseUrl}/${cleanPath}`;
    }

    // Check nested objects recursively
    for (const key in result) {
      if (key !== 'image' && result[key] && typeof result[key] === 'object') {
        result[key] = this.addUrlToData(result[key], baseUrl);
      }
    }

    return result;
  }
}
