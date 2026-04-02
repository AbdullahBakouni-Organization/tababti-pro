/**
 * Single gallery image info
 */
export interface GalleryImage {
  url: string;
  fileName: string;
  bucket: string;
  description?: string;
  uploadedAt: Date;
}
