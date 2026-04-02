import {
  uploadDoctorProfileImage,
  uploadUserProfileImage,
} from './upload-profile-images.util';

describe('upload-profile-images.util', () => {
  let minioService: { uploadFile: jest.Mock };

  const mockFile = {
    fieldname: 'file',
    originalname: 'photo.jpg',
    encoding: '7bit',
    mimetype: 'image/jpeg',
    buffer: Buffer.from('fake'),
    size: 1024,
  } as Express.Multer.File;

  const mockUploadResult = {
    url: 'https://minio.example.com/doctors/doc1/profile/photo.jpg',
    key: 'doctors/doc1/profile/photo.jpg',
  };

  beforeEach(() => {
    minioService = {
      uploadFile: jest.fn().mockResolvedValue(mockUploadResult),
    };
  });

  describe('uploadDoctorProfileImage', () => {
    it('should return undefined when no file is provided', async () => {
      const result = await uploadDoctorProfileImage(
        minioService as any,
        'doc1',
        undefined,
      );
      expect(result).toBeUndefined();
      expect(minioService.uploadFile).not.toHaveBeenCalled();
    });

    it('should upload file to correct folder and bucket', async () => {
      const result = await uploadDoctorProfileImage(
        minioService as any,
        'doc1',
        mockFile,
      );

      expect(minioService.uploadFile).toHaveBeenCalledWith(
        mockFile,
        'doctors',
        'doctors/doc1/profile',
      );
      expect(result).toEqual(mockUploadResult);
    });
  });

  describe('uploadUserProfileImage', () => {
    it('should return undefined when no file is provided', async () => {
      const result = await uploadUserProfileImage(
        minioService as any,
        'user1',
        undefined,
      );
      expect(result).toBeUndefined();
      expect(minioService.uploadFile).not.toHaveBeenCalled();
    });

    it('should upload file to correct folder and bucket', async () => {
      const result = await uploadUserProfileImage(
        minioService as any,
        'user1',
        mockFile,
      );

      expect(minioService.uploadFile).toHaveBeenCalledWith(
        mockFile,
        'patients',
        'patients/user1/profile/images',
      );
      expect(result).toEqual(mockUploadResult);
    });
  });
});
