import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  Body,
  Headers,
  UseInterceptors,
  UploadedFiles,
  BadRequestException,
} from '@nestjs/common';

import {
  ApiTags,
  ApiQuery,
  ApiOperation,
  ApiBody,
  ApiConsumes,
} from '@nestjs/swagger';
// must display all data for hpspital and center and doctor
import { FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import * as fs from 'fs';

import { EntityProfileService } from './entity-profile.service';
import {
  EntityType,
  AddGalleryDto,
  RemoveGalleryDto,
} from '../dto/get-entity-profile.dto';

import { ApiResponse } from '../../common/response/api-response';

@ApiTags('Entity Profile')
@Controller('entity/profile')
export class EntityProfileController {
  constructor(private readonly service: EntityProfileService) {}

  // ─────────────────────────────────────────────
  // Helper: Validate & Build Upload Path
  // ─────────────────────────────────────────────
  private buildUploadPath(type: EntityType): string {
    if (!Object.values(EntityType).includes(type)) {
      throw new BadRequestException('Invalid entity type');
    }

    const folder = `${type}s`;
    const uploadPath = join(process.cwd(), 'uploads', folder, 'gallery');

    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }

    return uploadPath;
  }

  // ─────────────────────────────────────────────
  // GET Full Profile
  // ─────────────────────────────────────────────
  @Get(':id')
  @ApiQuery({ name: 'type', enum: EntityType, required: true })
  async getEntityProfile(
    @Param('id') id: string,
    @Query('type') type: EntityType,
    @Headers('accept-language') lang: 'en' | 'ar' = 'en',
  ) {
    const data = await this.service.getEntityProfile(id, type);

    return ApiResponse.success({
      lang,
      messageKey: 'entity.PROFILE_FETCHED',
      data,
    });
  }

  // ─────────────────────────────────────────────
  // GET Gallery
  // ─────────────────────────────────────────────
  @Get(':id/gallery')
  @ApiQuery({ name: 'type', enum: EntityType, required: true })
  async getGallery(
    @Param('id') id: string,
    @Query('type') type: EntityType,
    @Headers('accept-language') lang: 'en' | 'ar' = 'en',
  ) {
    const data = await this.service.getGallery(id, type);

    return ApiResponse.success({
      lang,
      messageKey: 'entity.GALLERY_FETCHED',
      data: { gallery: data, total: data.length },
    });
  }

  // ─────────────────────────────────────────────
  // POST Upload Images (Dynamic by Type)
  // ─────────────────────────────────────────────
  @Post(':id/gallery')
  @ApiConsumes('multipart/form-data')
  @ApiQuery({ name: 'type', enum: EntityType, required: true })
  @ApiBody({ type: AddGalleryDto })
  @UseInterceptors(
    FilesInterceptor('images', 10, {
      limits: { fileSize: 5 * 1024 * 1024 },
      storage: diskStorage({
        destination: (req, file, cb) => {
          try {
            const type = req.query.type as EntityType;
            const folder = `${type}s`;
            const uploadPath = join(
              process.cwd(),
              'uploads',
              folder,
              'gallery',
            );

            if (!fs.existsSync(uploadPath)) {
              fs.mkdirSync(uploadPath, { recursive: true });
            }

            cb(null, uploadPath);
          } catch (error) {
            cb(error, '');
          }
        },
        filename: (req, file, cb) => {
          const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1e9);
          cb(null, uniqueName + extname(file.originalname));
        },
      }),
      fileFilter: (req, file, cb) => {
        if (!file.mimetype.match(/\/(jpg|jpeg|png|webp)$/)) {
          return cb(new BadRequestException('Only image files allowed'), false);
        }
        cb(null, true);
      },
    }),
  )
  async addGallery(
    @Param('id') id: string,
    @Query('type') type: EntityType,
    @UploadedFiles() files: Express.Multer.File[],
    @Headers('accept-language') lang: 'en' | 'ar' = 'en',
  ) {
    if (!files?.length) {
      throw new BadRequestException('No images uploaded');
    }

    const imagePaths = files.map(
      (file) => `uploads/${type}s/gallery/${file.filename}`,
    );

    const data = await this.service.addGallery(id, type, imagePaths);

    return ApiResponse.success({
      lang,
      messageKey: 'entity.GALLERY_UPDATED',
      data: { gallery: data, total: data.length },
    });
  }

  // ─────────────────────────────────────────────
  // DELETE Remove Specific Images
  // ─────────────────────────────────────────────
  @Delete(':id/gallery')
  @ApiQuery({ name: 'type', enum: EntityType, required: true })
  @ApiBody({ type: RemoveGalleryDto })
  async removeGallery(
    @Param('id') id: string,
    @Query('type') type: EntityType,
    @Body() dto: RemoveGalleryDto,
    @Headers('accept-language') lang: 'en' | 'ar' = 'en',
  ) {
    // delete from DB first
    const data = await this.service.removeGallery(id, type, dto.images);

    // delete physically
    dto.images.forEach((imagePath) => {
      const fullPath = join(process.cwd(), imagePath);
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
      }
    });

    return ApiResponse.success({
      lang,
      messageKey: 'entity.GALLERY_UPDATED',
      data: { gallery: data, total: data.length },
    });
  }

  // ─────────────────────────────────────────────
  // DELETE Clear Entire Gallery
  // ─────────────────────────────────────────────
  @Delete(':id/gallery/all')
  @ApiQuery({ name: 'type', enum: EntityType, required: true })
  async clearGallery(
    @Param('id') id: string,
    @Query('type') type: EntityType,
    @Headers('accept-language') lang: 'en' | 'ar' = 'en',
  ) {
    const existingImages = await this.service.getGallery(id, type);

    await this.service.clearGallery(id, type);

    existingImages.forEach((imagePath) => {
      const fullPath = join(process.cwd(), imagePath);
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
      }
    });

    return ApiResponse.success({
      lang,
      messageKey: 'entity.GALLERY_CLEARED',
      data: { gallery: [], total: 0 },
    });
  }
}
