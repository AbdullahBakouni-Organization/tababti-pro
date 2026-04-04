import 'dotenv/config'; // Load env first
import { unlinkSync, existsSync } from 'fs';
import { Logger } from '@nestjs/common';

export class FileUtil {
  private static readonly logger = new Logger(FileUtil.name);

  static deleteFile(filePath: string): void {
    if (filePath && existsSync(filePath)) {
      try {
        unlinkSync(filePath);
      } catch (error) {
        FileUtil.logger.error('Error deleting file', error);
      }
    }
  }

  static getFileUrl(filename: string | null): string | null {
    if (!filename) return null;
    return `${process.env.APP_URL || 'http://localhost:3000'}/uploads/profiles/${filename}`;
  }

  static extractFilename(path: string | null): string | null {
    if (!path) return null;
    const parts = path.split('/').pop() || path.split('\\').pop();
    return parts && parts.length > 0 ? parts : null;
  }
}
