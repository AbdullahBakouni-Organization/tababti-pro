import { BadRequestException } from '@nestjs/common';
import multer from 'multer';

export const memoryStorageConfig = {
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req: any, file: Express.Multer.File, cb: any) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    allowed.includes(file.mimetype)
      ? cb(null, true)
      : cb(
          new BadRequestException(
            'Invalid file type. Allowed: JPEG, PNG, WEBP',
          ),
          false,
        );
  },
};

export const memoryDocsStorageConfig = {
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
  fileFilter: (req: any, file: Express.Multer.File, cb: any) => {
    const allowedImageTypes = ['image/jpeg', 'image/png', 'image/webp'];
    const allowedDocTypes = ['application/pdf'];
    const isImage = file.fieldname.includes('Image');
    const isDocument = file.fieldname.includes('Document');
    if (isImage && allowedImageTypes.includes(file.mimetype)) {
      cb(null, true);
    } else if (isDocument && allowedDocTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new BadRequestException(
          `Invalid file type for ${file.fieldname}. ` +
            `${isImage ? 'Allowed: JPEG, PNG, WEBP' : 'Allowed: PDF'}`,
        ),
        false,
      );
    }
  },
};
