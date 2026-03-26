import 'dotenv/config';
import {
  Injectable,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Minio from 'minio';
import { randomUUID } from 'crypto';
import * as path from 'path';

export interface UploadResult {
  fileName: string;
  originalName: string;
  mimeType: string;
  size: number;
  bucket: string;
  url: string;
  etag: string;
}

@Injectable()
export class MinioService {
  private readonly logger = new Logger(MinioService.name);
  private readonly minioClient: Minio.Client;
  private readonly buckets = {
    doctors: process.env.MINIO_BUCKET_DOCTORS!,
    patients: process.env.MINIO_BUCKET_PATIENTS!,
    general: process.env.MINIO_BUCKET_GENERAL!,
  };

  constructor(private readonly configService: ConfigService) {
    // Initialize MinIO client
    this.minioClient = new Minio.Client({
      endPoint: this.configService.get<string>('MINIO_ENDPOINT', ''),
      port: parseInt(this.configService.get<string>('MINIO_PORT', '')),
      useSSL:
        this.configService.get<string>('MINIO_USE_SSL', 'false') === 'true',
      accessKey: this.configService.get<string>('MINIO_ACCESS_KEY', ''),
      secretKey: this.configService.get<string>('MINIO_SECRET_KEY', ''),
    });

    this.logger.log('MinIO client initialized');
    this.ensureBucketsExist();
  }

  /**
   * Ensure all required buckets exist
   */
  private async ensureBucketsExist(): Promise<void> {
    try {
      for (const [key, bucketName] of Object.entries(this.buckets)) {
        const exists = await this.minioClient.bucketExists(bucketName);
        if (!exists) {
          await this.minioClient.makeBucket(bucketName, 'us-east-1');
          this.logger.log(`Bucket created: ${bucketName}`);
        }
      }
    } catch (error) {
      this.logger.error(`Failed to ensure buckets exist: ${error.message}`);
    }
  }

  /**
   * Upload file to MinIO
   */
  async uploadFile(
    file: Express.Multer.File,
    bucket: 'doctors' | 'patients' | 'general',
    folder?: string,
  ): Promise<UploadResult> {
    try {
      const bucketName = this.buckets[bucket];

      // Generate unique filename
      const fileExt = path.extname(file.originalname);
      const fileName = `${folder ? folder + '/' : ''}${randomUUID()}${fileExt}`;

      // Upload to MinIO
      const uploadInfo = await this.minioClient.putObject(
        bucketName,
        fileName,
        file.buffer,
        file.size,
        {
          'Content-Type': file.mimetype,
          'X-Original-Name': Buffer.from(file.originalname).toString('base64'),
        },
      );

      // Generate public URL
      const url = this.getPublicUrl(bucketName, fileName);

      this.logger.log(`File uploaded: ${fileName} to bucket ${bucketName}`);

      return {
        fileName,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        bucket: bucketName,
        url,
        etag: uploadInfo.etag,
      };
    } catch (error) {
      this.logger.error(`File upload failed: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Failed to upload file');
    }
  }

  /**
   * Upload doctor certificate/license documents
   */
  async uploadDoctorDocument(
    file: Express.Multer.File,
    doctorId: string,
    documentType: 'certificate' | 'license',
    fileType: 'image' | 'pdf',
  ): Promise<UploadResult> {
    const folder = `doctors/${doctorId}/${documentType}s/${fileType}s`;
    return this.uploadFile(file, 'doctors', folder);
  }

  /**
   * Get public URL for a file
   */
  getPublicUrl(bucket: string, fileName: string): string {
    const publicUrl = this.configService.get<string>(
      'MINIO_PUBLIC_URL_DEV',
      '',
    );

    if (publicUrl) {
      return `${publicUrl}/${bucket}/${fileName}`;
    }

    // Fallback to internal URL (for development without proxy)
    const endpoint = this.configService.get<string>(
      'MINIO_ENDPOINT',
      'localhost',
    );
    const port = this.configService.get<string>('MINIO_PORT', '9000');
    const useSSL =
      this.configService.get<string>('MINIO_USE_SSL', 'false') === 'true';
    const protocol = useSSL ? 'https' : 'http';
    const portSuffix =
      (useSSL && port === '443') || (!useSSL && port === '80')
        ? ''
        : `:${port}`;

    return `${protocol}://${endpoint}${portSuffix}/${bucket}/${fileName}`;
  }

  /**
   * Get presigned URL for temporary access
   */
  async getPresignedUrl(
    bucket: string,
    fileName: string,
    expirySeconds: number = 3600,
  ): Promise<string> {
    try {
      return await this.minioClient.presignedGetObject(
        bucket,
        fileName,
        expirySeconds,
      );
    } catch (error) {
      this.logger.error(`Failed to generate presigned URL: ${error.message}`);
      throw new InternalServerErrorException('Failed to generate file URL');
    }
  }

  /**
   * Delete file from MinIO
   */
  async deleteFile(bucket: string, fileName: string): Promise<void> {
    try {
      await this.minioClient.removeObject(bucket, fileName);
      this.logger.log(`File deleted: ${fileName} from bucket ${bucket}`);
    } catch (error) {
      this.logger.error(`File deletion failed: ${error.message}`);
      throw new InternalServerErrorException('Failed to delete file');
    }
  }

  /**
   * Delete multiple files
   */
  async deleteFiles(bucket: string, fileNames: string[]): Promise<void> {
    try {
      await this.minioClient.removeObjects(bucket, fileNames);
      this.logger.log(
        `${fileNames.length} files deleted from bucket ${bucket}`,
      );
    } catch (error) {
      this.logger.error(`Batch file deletion failed: ${error.message}`);
      throw new InternalServerErrorException('Failed to delete files');
    }
  }

  /**
   * Check if file exists
   */
  async fileExists(bucket: string, fileName: string): Promise<boolean> {
    try {
      await this.minioClient.statObject(bucket, fileName);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get file metadata
   */
  async getFileMetadata(bucket: string, fileName: string): Promise<any> {
    try {
      return await this.minioClient.statObject(bucket, fileName);
    } catch (error) {
      this.logger.error(`Failed to get file metadata: ${error.message}`);
      throw new InternalServerErrorException('Failed to get file metadata');
    }
  }

  /**
   * List files in a folder
   */
  async listFiles(bucket: string, prefix?: string): Promise<string[]> {
    return new Promise((resolve, reject) => {
      const files: string[] = [];
      const stream = this.minioClient.listObjects(bucket, prefix, true);

      stream.on('data', (obj) => {
        if (obj.name) {
          files.push(obj.name);
        }
      });

      stream.on('end', () => {
        resolve(files);
      });

      stream.on('error', (err) => {
        this.logger.error(`Failed to list files: ${err.message}`);
        reject(new InternalServerErrorException('Failed to list files'));
      });
    });
  }
}
