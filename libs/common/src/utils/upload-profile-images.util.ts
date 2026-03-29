import { MinioService } from '../file-storage';
import type { UploadResult } from '../file-storage';

export async function uploadDoctorProfileImage(
  minioService: MinioService,
  doctorId: string,
  file: Express.Multer.File | undefined,
): Promise<UploadResult | undefined> {
  if (!file) return undefined;
  const folder = `doctors/${doctorId}/profile`;
  return await minioService.uploadFile(file, 'doctors', folder);
}

export async function uploadUserProfileImage(
  minioService: MinioService,
  userId: string,
  file: Express.Multer.File | undefined,
): Promise<UploadResult | undefined> {
  if (!file) return undefined;
  const folder = `patients/${userId}/profile/images`;
  return await minioService.uploadFile(file, 'patients', folder);
}
