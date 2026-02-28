import { extname } from 'path';
import { BadRequestException } from '@nestjs/common';
import { diskStorage } from 'multer';
import { v4 as uuidv4 } from 'uuid';

// Image file filter
export const imageFileFilter = (req: any, file: any, callback: any) => {
  const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

  if (!allowedMimes.includes(file.mimetype)) {
    return callback(
      new BadRequestException(
        'Invalid file type. Only JPEG, JPG, PNG, and WEBP are allowed',
      ),
      false,
    );
  }

  callback(null, true);
};

// Storage configuration
export const storage = diskStorage({
  destination: './uploads/profiles',
  filename: (req, file, callback) => {
    const uniqueName = `${uuidv4()}${extname(file.originalname)}`;
    callback(null, uniqueName);
  },
});

// File size limit (5MB)
export const FILE_SIZE_LIMIT = 5 * 1024 * 1024;

// Multer options
export const multerOptions = {
  storage: storage,
  fileFilter: imageFileFilter,
  limits: {
    fileSize: FILE_SIZE_LIMIT,
  },
};
