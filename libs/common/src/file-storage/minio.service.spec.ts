// Mock minio before imports
const mockPutObject = jest.fn();
const mockRemoveObject = jest.fn();
const mockRemoveObjects = jest.fn();
const mockStatObject = jest.fn();
const mockPresignedGetObject = jest.fn();
const mockBucketExists = jest.fn().mockResolvedValue(true);
const mockMakeBucket = jest.fn().mockResolvedValue(undefined);
const mockListObjects = jest.fn();

jest.mock('minio', () => ({
  Client: jest.fn().mockImplementation(() => ({
    putObject: mockPutObject,
    removeObject: mockRemoveObject,
    removeObjects: mockRemoveObjects,
    statObject: mockStatObject,
    presignedGetObject: mockPresignedGetObject,
    bucketExists: mockBucketExists,
    makeBucket: mockMakeBucket,
    listObjects: mockListObjects,
  })),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { InternalServerErrorException } from '@nestjs/common';
import { MinioService } from './minio.service';
import { createMockConfigService } from '@app/common/testing';
import { EventEmitter } from 'events';

describe('MinioService', () => {
  let service: MinioService;
  let configService: ReturnType<typeof createMockConfigService>;

  const mockFile: Express.Multer.File = {
    fieldname: 'file',
    originalname: 'test.jpg',
    encoding: '7bit',
    mimetype: 'image/jpeg',
    buffer: Buffer.from('file-content'),
    size: 1024,
    stream: null as any,
    destination: '',
    filename: 'test.jpg',
    path: '',
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockBucketExists.mockResolvedValue(true);

    configService = createMockConfigService({
      MINIO_ENDPOINT: 'localhost',
      MINIO_PORT: '9000',
      MINIO_USE_SSL: 'false',
      MINIO_ACCESS_KEY: 'test-key',
      MINIO_SECRET_KEY: 'test-secret',
      MINIO_BUCKET_DOCTORS: 'doctors',
      MINIO_BUCKET_PATIENTS: 'patients',
      MINIO_BUCKET_GENERAL: 'general',
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MinioService,
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get<MinioService>(MinioService);
    // Wait for ensureBucketsExist to complete
    await new Promise((resolve) => setTimeout(resolve, 10));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ── uploadFile ────────────────────────────────────────────────────────────

  describe('uploadFile()', () => {
    it('uploads file and returns UploadResult', async () => {
      mockPutObject.mockResolvedValue({ etag: 'mock-etag' });

      const result = await service.uploadFile(mockFile, 'doctors');

      expect(mockPutObject).toHaveBeenCalled();
      expect(result.originalName).toBe('test.jpg');
      expect(result.mimeType).toBe('image/jpeg');
      expect(result.size).toBe(1024);
      expect(result.etag).toBe('mock-etag');
      expect(result.fileName).toMatch(/\.jpg$/);
      expect(result.url).toBeDefined();
    });

    it('includes folder prefix in filename when folder provided', async () => {
      mockPutObject.mockResolvedValue({ etag: 'etag-1' });

      const result = await service.uploadFile(mockFile, 'doctors', 'profile');

      expect(result.fileName).toMatch(/^profile\//);
    });

    it('throws InternalServerErrorException on upload failure', async () => {
      mockPutObject.mockRejectedValue(new Error('MinIO connection failed'));

      await expect(service.uploadFile(mockFile, 'general')).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  // ── uploadDoctorDocument ──────────────────────────────────────────────────

  describe('uploadDoctorDocument()', () => {
    it('uploads document to doctors bucket with correct folder', async () => {
      mockPutObject.mockResolvedValue({ etag: 'doc-etag' });

      const result = await service.uploadDoctorDocument(
        mockFile,
        'doctor-123',
        'certificate',
        'image',
      );

      expect(result.fileName).toContain('doctor-123');
      expect(result.fileName).toContain('certificates');
      expect(result.originalName).toBe('test.jpg');
    });
  });

  // ── getPublicUrl ──────────────────────────────────────────────────────────

  describe('getPublicUrl()', () => {
    it('uses MINIO_PUBLIC_URL_DEV when configured', () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'MINIO_PUBLIC_URL_DEV') return 'https://cdn.example.com';
        return '';
      });

      const url = service.getPublicUrl('doctors', 'file.jpg');
      expect(url).toBe('https://cdn.example.com/doctors/file.jpg');
    });

    it('builds internal URL when no public URL configured', () => {
      configService.get.mockImplementation((key: string, def?: string) => {
        const map: Record<string, string> = {
          MINIO_PUBLIC_URL_DEV: '',
          MINIO_ENDPOINT: 'localhost',
          MINIO_PORT: '9000',
          MINIO_USE_SSL: 'false',
        };
        return map[key] ?? def ?? '';
      });

      const url = service.getPublicUrl('doctors', 'file.jpg');
      expect(url).toBe('http://localhost:9000/doctors/file.jpg');
    });
  });

  // ── getPresignedUrl ───────────────────────────────────────────────────────

  describe('getPresignedUrl()', () => {
    it('returns presigned URL', async () => {
      mockPresignedGetObject.mockResolvedValue('https://presigned.url/file');

      const url = await service.getPresignedUrl('doctors', 'file.jpg');
      expect(url).toBe('https://presigned.url/file');
    });

    it('uses default expiry of 3600 seconds', async () => {
      mockPresignedGetObject.mockResolvedValue('https://presigned.url/file');

      await service.getPresignedUrl('doctors', 'file.jpg');
      expect(mockPresignedGetObject).toHaveBeenCalledWith(
        'doctors',
        'file.jpg',
        3600,
      );
    });

    it('throws InternalServerErrorException on failure', async () => {
      mockPresignedGetObject.mockRejectedValue(new Error('error'));

      await expect(
        service.getPresignedUrl('doctors', 'file.jpg'),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });

  // ── deleteFile ────────────────────────────────────────────────────────────

  describe('deleteFile()', () => {
    it('deletes file from MinIO', async () => {
      mockRemoveObject.mockResolvedValue(undefined);

      await service.deleteFile('doctors', 'file.jpg');
      expect(mockRemoveObject).toHaveBeenCalledWith('doctors', 'file.jpg');
    });

    it('throws InternalServerErrorException on deletion failure', async () => {
      mockRemoveObject.mockRejectedValue(new Error('error'));

      await expect(service.deleteFile('doctors', 'file.jpg')).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  // ── deleteFiles ───────────────────────────────────────────────────────────

  describe('deleteFiles()', () => {
    it('deletes multiple files', async () => {
      mockRemoveObjects.mockResolvedValue(undefined);

      await service.deleteFiles('doctors', ['file1.jpg', 'file2.jpg']);
      expect(mockRemoveObjects).toHaveBeenCalledWith('doctors', [
        'file1.jpg',
        'file2.jpg',
      ]);
    });

    it('throws InternalServerErrorException on failure', async () => {
      mockRemoveObjects.mockRejectedValue(new Error('error'));

      await expect(
        service.deleteFiles('doctors', ['file.jpg']),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });

  // ── fileExists ────────────────────────────────────────────────────────────

  describe('fileExists()', () => {
    it('returns true when file exists', async () => {
      mockStatObject.mockResolvedValue({ size: 1024 });

      const result = await service.fileExists('doctors', 'file.jpg');
      expect(result).toBe(true);
    });

    it('returns false when file does not exist', async () => {
      mockStatObject.mockRejectedValue(new Error('Not found'));

      const result = await service.fileExists('doctors', 'nonexistent.jpg');
      expect(result).toBe(false);
    });
  });

  // ── getFileMetadata ───────────────────────────────────────────────────────

  describe('getFileMetadata()', () => {
    it('returns file metadata', async () => {
      const metadata = { size: 2048, etag: 'etag-1' };
      mockStatObject.mockResolvedValue(metadata);

      const result = await service.getFileMetadata('doctors', 'file.jpg');
      expect(result).toEqual(metadata);
    });

    it('throws InternalServerErrorException on failure', async () => {
      mockStatObject.mockRejectedValue(new Error('error'));

      await expect(
        service.getFileMetadata('doctors', 'file.jpg'),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });

  // ── listFiles ─────────────────────────────────────────────────────────────

  describe('listFiles()', () => {
    it('returns list of file names', async () => {
      const emitter = new EventEmitter();
      mockListObjects.mockReturnValue(emitter);

      const promise = service.listFiles('doctors', 'profile/');
      emitter.emit('data', { name: 'profile/file1.jpg' });
      emitter.emit('data', { name: 'profile/file2.jpg' });
      emitter.emit('end');

      const result = await promise;
      expect(result).toEqual(['profile/file1.jpg', 'profile/file2.jpg']);
    });

    it('rejects on stream error', async () => {
      const emitter = new EventEmitter();
      mockListObjects.mockReturnValue(emitter);

      const promise = service.listFiles('doctors');
      emitter.emit('error', new Error('Stream failed'));

      await expect(promise).rejects.toThrow(InternalServerErrorException);
    });
  });
});
