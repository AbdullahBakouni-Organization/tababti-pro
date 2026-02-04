import { extname } from 'path';
import { BadRequestException } from '@nestjs/common';
import { diskStorage } from 'multer';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync } from 'fs';

// ============================================
// File Type Configurations
// ============================================

export const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
];

export const ALLOWED_PDF_TYPES = ['application/pdf'];

export const ALLOWED_DOCUMENT_TYPES = [
  ...ALLOWED_IMAGE_TYPES,
  ...ALLOWED_PDF_TYPES,
];

// File size limits
export const IMAGE_SIZE_LIMIT = 5 * 1024 * 1024; // 5MB
export const PDF_SIZE_LIMIT = 10 * 1024 * 1024; // 10MB

// ============================================
// File Filters
// ============================================

export const imageFileFilter = (req: any, file: any, callback: any) => {
  if (!ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
    return callback(
      new BadRequestException(
        `Invalid image type. Only ${ALLOWED_IMAGE_TYPES.join(', ')} are allowed`,
      ),
      false,
    );
  }
  callback(null, true);
};

export const pdfFileFilter = (req: any, file: any, callback: any) => {
  if (!ALLOWED_PDF_TYPES.includes(file.mimetype)) {
    return callback(
      new BadRequestException('Invalid file type. Only PDF files are allowed'),
      false,
    );
  }
  callback(null, true);
};

export const documentFileFilter = (req: any, file: any, callback: any) => {
  if (!ALLOWED_DOCUMENT_TYPES.includes(file.mimetype)) {
    return callback(
      new BadRequestException(
        `Invalid file type. Only ${ALLOWED_DOCUMENT_TYPES.join(', ')} are allowed`,
      ),
      false,
    );
  }
  callback(null, true);
};

// ============================================
// Storage Configurations
// ============================================

const createDirectory = (path: string) => {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true });
  }
};

// Doctor images storage
export const doctorImageStorage = diskStorage({
  destination: (req, file, callback) => {
    const uploadPath = './uploads/doctors/images';
    createDirectory(uploadPath);
    callback(null, uploadPath);
  },
  filename: (req, file, callback) => {
    const uniqueName = `${randomUUID()}_${Date.now()}${extname(file.originalname)}`;
    callback(null, uniqueName);
  },
});

// Doctor PDFs storage
export const doctorPdfStorage = diskStorage({
  destination: (req, file, callback) => {
    const uploadPath = './uploads/doctors/documents';
    createDirectory(uploadPath);
    callback(null, uploadPath);
  },
  filename: (req, file, callback) => {
    const uniqueName = `${randomUUID()}_${Date.now()}${extname(file.originalname)}`;
    callback(null, uniqueName);
  },
});

// Combined storage for both images and PDFs
export const doctorDocumentStorage = diskStorage({
  destination: (req, file, callback) => {
    let uploadPath;

    if (ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
      uploadPath = './uploads/doctors/images';
    } else if (ALLOWED_PDF_TYPES.includes(file.mimetype)) {
      uploadPath = './uploads/doctors/documents';
    } else {
      uploadPath = './uploads/doctors/misc';
    }

    createDirectory(uploadPath);
    callback(null, uploadPath);
  },
  filename: (req, file, callback) => {
    const uniqueName = `${randomUUID()}_${Date.now()}${extname(file.originalname)}`;
    callback(null, uniqueName);
  },
});

// ============================================
// Multer Options
// ============================================

export const doctorImageOptions = {
  storage: doctorImageStorage,
  fileFilter: imageFileFilter,
  limits: {
    fileSize: IMAGE_SIZE_LIMIT,
  },
};

export const doctorPdfOptions = {
  storage: doctorPdfStorage,
  fileFilter: pdfFileFilter,
  limits: {
    fileSize: PDF_SIZE_LIMIT,
  },
};

export const doctorDocumentOptions = {
  storage: doctorDocumentStorage,
  fileFilter: documentFileFilter,
  limits: {
    fileSize: PDF_SIZE_LIMIT, // Use larger limit to accommodate both
  },
};

// ============================================
// Legacy Support (for backward compatibility)
// ============================================

export const storage = doctorImageStorage;
export const FILE_SIZE_LIMIT = IMAGE_SIZE_LIMIT;
export const multerOptions = doctorImageOptions;

// ============================================
// Utility Functions
// ============================================

export const isImageFile = (mimetype: string): boolean => {
  return ALLOWED_IMAGE_TYPES.includes(mimetype);
};

export const isPdfFile = (mimetype: string): boolean => {
  return ALLOWED_PDF_TYPES.includes(mimetype);
};

export const getFileCategory = (
  mimetype: string,
): 'image' | 'pdf' | 'unknown' => {
  if (isImageFile(mimetype)) return 'image';
  if (isPdfFile(mimetype)) return 'pdf';
  return 'unknown';
};

export const validateFileSize = (file: Express.Multer.File): void => {
  const maxSize = isImageFile(file.mimetype)
    ? IMAGE_SIZE_LIMIT
    : PDF_SIZE_LIMIT;

  if (file.size > maxSize) {
    const maxSizeMB = maxSize / (1024 * 1024);
    throw new BadRequestException(
      `File too large. Maximum size for ${getFileCategory(file.mimetype)} files is ${maxSizeMB}MB`,
    );
  }
};
