import 'dotenv/config'; // Load env first
import { unlinkSync, existsSync } from 'fs';

export class FileUtil {
  static deleteFile(filePath: string): void {
    if (filePath && existsSync(filePath)) {
      try {
        unlinkSync(filePath);
      } catch (error) {
        console.error('Error deleting file:', error);
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
