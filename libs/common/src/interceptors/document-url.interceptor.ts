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
export class DocumentUrlInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const baseUrl = process.env.APP_URL || 'http://localhost:3000';

    return next.handle().pipe(
      map((data) => {
        return this.addUrlToDocuments(data, baseUrl);
      }),
    );
  }

  private addUrlToDocuments(data: any, baseUrl: string): any {
    if (!data || typeof data !== 'object') return data;

    // Handle Arrays
    if (Array.isArray(data)) {
      return data.map((item) => this.addUrlToDocuments(item, baseUrl));
    }

    // Create a new object to avoid mutation
    const result = { ...data };

    // Document fields to process
    const documentFields = [
      'image',
      'certificateImage',
      'licenseImage',
      'certificateDocument',
      'licenseDocument',
      'profileImage',
      'avatar',
    ];

    documentFields.forEach((field) => {
      if (result[field] && typeof result[field] === 'string') {
        result[field] = this.createFullUrl(result[field], baseUrl);
      }
    });

    // Handle nested objects for documents
    if (result.documents && typeof result.documents === 'object') {
      Object.keys(result.documents).forEach((key) => {
        if (result.documents[key] && typeof result.documents[key] === 'string') {
          result.documents[key] = this.createFullUrl(result.documents[key], baseUrl);
        }
      });
    }

    // Handle certificate and license objects
    if (result.certificate && typeof result.certificate === 'object') {
      if (result.certificate.image) {
        result.certificate.image = this.createFullUrl(result.certificate.image, baseUrl);
      }
      if (result.certificate.document) {
        result.certificate.document = this.createFullUrl(result.certificate.document, baseUrl);
      }
    }

    if (result.license && typeof result.license === 'object') {
      if (result.license.image) {
        result.license.image = this.createFullUrl(result.license.image, baseUrl);
      }
      if (result.license.document) {
        result.license.document = this.createFullUrl(result.license.document, baseUrl);
      }
    }

    // Recursively handle nested objects
    Object.keys(result).forEach((key) => {
      if (
        result[key] &&
        typeof result[key] === 'object' &&
        !documentFields.includes(key) &&
        key !== 'documents' &&
        key !== 'certificate' &&
        key !== 'license'
      ) {
        result[key] = this.addUrlToDocuments(result[key], baseUrl);
      }
    });

    return result;
  }

  private createFullUrl(filePath: string, baseUrl: string): string {
    // Skip if already a full URL
    if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
      return filePath;
    }

    // Normalize path separators and remove leading slashes
    const cleanPath = filePath.replace(/\\/g, '/').replace(/^\/+/, '');

    // Ensure baseUrl doesn't end with slash and cleanPath doesn't start with slash
    const normalizedBaseUrl = baseUrl.replace(/\/+$/, '');

    return `${normalizedBaseUrl}/${cleanPath}`;
  }
}
