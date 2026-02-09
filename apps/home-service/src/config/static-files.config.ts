import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';

/**
 * Configure static file serving for uploaded documents
 */
export function configureStaticFiles(app: NestExpressApplication): void {
  // Ensure upload directories exist
  const uploadDirs = [
    './uploads',
    './uploads/users',
    './uploads/users/images',

    './uploads/doctors',
    './uploads/doctors/images',
    './uploads/doctors/documents',
    './uploads/doctors/misc',
  ];

  uploadDirs.forEach((dir) => {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
      console.log(`Created upload directory: ${dir}`);
    }
  });

  // Serve static files from uploads directory
  app.useStaticAssets(join(__dirname, '..', '..', '..', '..', 'uploads'), {
    prefix: '/uploads/',
    setHeaders: (res, path) => {
      // Security headers for file serving
      res.set('X-Content-Type-Options', 'nosniff');
      res.set('X-Frame-Options', 'DENY');
      res.set('X-XSS-Protection', '1; mode=block');

      // Cache control for images and documents
      if (path.match(/\.(jpg|jpeg|png|webp|pdf)$/i)) {
        res.set('Cache-Control', 'public, max-age=86400'); // 24 hours
      }
    },
  });

  console.log('Static file serving configured for /uploads/');
}

/**
 * Environment-specific file serving configuration
 */
export const getFileServeConfig = () => {
  const isProd = process.env.NODE_ENV === 'production';

  return {
    maxAge: isProd ? '7d' : '1h',
    etag: true,
    lastModified: true,
    immutable: isProd,
    cacheControl: isProd,
  };
};

/**
 * Security middleware for file access
 */
export const fileAccessMiddleware = (req: any, res: any, next: any) => {
  const filePath = req.path;

  // Block access to sensitive file types
  const blockedExtensions = ['.env', '.config', '.key', '.pem', '.crt'];
  const hasBlockedExtension = blockedExtensions.some((ext) =>
    filePath.toLowerCase().endsWith(ext),
  );

  if (hasBlockedExtension) {
    return res.status(403).json({
      error: 'Access denied',
      message: 'File type not allowed',
    });
  }

  // Only allow access to uploads directory
  if (!filePath.startsWith('/uploads')) {
    return res.status(404).json({
      error: 'Not found',
      message: 'File not found',
    });
  }

  next();
};
