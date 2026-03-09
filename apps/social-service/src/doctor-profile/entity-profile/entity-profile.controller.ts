import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  Headers,
  UseInterceptors,
  UploadedFiles,
  BadRequestException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiQuery,
  ApiOperation,
  ApiBody,
  ApiConsumes,
  ApiBearerAuth,
  ApiHeader,
} from '@nestjs/swagger';
import { FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import * as fs from 'fs';

import { EntityProfileService } from './entity-profile.service';
import {
  EntityType,
  AddGalleryDto,
  RemoveGalleryDto,
  ReviewEntityDto,
} from '../dto/get-entity-profile.dto';

import { JwtAuthGuard } from '@app/common/guards/jwt.guard';
import { JwtUserGuard } from '@app/common/guards/jwt-user.guard';
import { RolesGuard } from '@app/common/guards/role.guard';
import { Roles } from '@app/common/decorator/role.decorator';
import { CurrentUser } from '@app/common/decorator/current-user.decorator';
import { UserRole } from '@app/common/database/schemas/common.enums';
import { ApiResponse } from '@app/common/response/api-response';

type Lang = 'en' | 'ar';
function resolveLang(h?: string): Lang {
  return h === 'ar' ? 'ar' : 'en';
}

// ── Multer factory ────────────────────────────────────────────────────────────
function galleryInterceptor(maxCount = 10) {
  return FilesInterceptor('images', maxCount, {
    limits: { fileSize: 5 * 1024 * 1024 },
    storage: diskStorage({
      destination: (req, _file, cb) => {
        try {
          const type = req.query.type as EntityType;
          if (!Object.values(EntityType).includes(type)) {
            return cb(new BadRequestException('entity.INVALID_TYPE'), '');
          }
          const uploadPath = join(
            process.cwd(),
            'uploads',
            `${type}s`,
            'gallery',
          );
          fs.mkdirSync(uploadPath, { recursive: true });
          cb(null, uploadPath);
        } catch (err) {
          cb(err, '');
        }
      },
      filename: (_req, file, cb) => {
        cb(
          null,
          `${Date.now()}-${Math.round(Math.random() * 1e9)}${extname(file.originalname)}`,
        );
      },
    }),
    fileFilter: (_req, file, cb) => {
      if (!file.mimetype.match(/\/(jpg|jpeg|png|webp)$/)) {
        return cb(new BadRequestException('entity.INVALID_FILE_TYPE'), false);
      }
      cb(null, true);
    },
  });
}

@ApiTags('Entity Profile')
@ApiHeader({
  name: 'accept-language',
  description: 'Response language: en | ar',
  required: false,
  schema: { default: 'en', enum: ['en', 'ar'] },
})
@Controller('entity/profile')
export class EntityProfileController {
  constructor(private readonly service: EntityProfileService) {}

  // ══════════════════════════════════════════════════════════════════════════
  // PUBLIC — browse approved entities (paginated)
  // ══════════════════════════════════════════════════════════════════════════

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.USER)
  @ApiOperation({ summary: 'Browse approved entities (public, paginated)' })
  @ApiQuery({ name: 'type', enum: EntityType, required: true })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  async browseEntities(
    @Query('type') type: EntityType,
    @Query('page') page = '1',
    @Query('limit') limit = '10',
    @Headers('accept-language') acceptLanguage?: string,
  ) {
    const data = await this.service.browseEntities(
      type,
      Math.max(1, parseInt(page, 10)),
      Math.min(Math.max(1, parseInt(limit, 10)), 50),
    );
    return ApiResponse.success({
      lang: resolveLang(acceptLanguage),
      messageKey: 'entity.LIST',
      data,
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // OWNER — get own profile
  // ══════════════════════════════════════════════════════════════════════════

  @Get('me')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DOCTOR, UserRole.HOSPITAL, UserRole.CENTER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Entity owner: get own full profile' })
  async getMyProfile(
    @CurrentUser('accountId') accountId: string,
    @CurrentUser('role') role: UserRole,
    @Headers('accept-language') acceptLanguage?: string,
  ) {
    const data = await this.service.getMyProfile(accountId, role);
    return ApiResponse.success({
      lang: resolveLang(acceptLanguage),
      messageKey: 'entity.PROFILE_FETCHED',
      data,
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ADMIN — list all entities (any status)
  // ══════════════════════════════════════════════════════════════════════════

  @Get('admin/list')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin: list all entities with any status' })
  @ApiQuery({ name: 'type', enum: EntityType, required: true })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  async adminListEntities(
    @Query('type') type: EntityType,
    @Query('status') status?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '10',
    @Headers('accept-language') acceptLanguage?: string,
  ) {
    const data = await this.service.adminListEntities(
      type,
      status,
      Math.max(1, parseInt(page, 10)),
      Math.min(Math.max(1, parseInt(limit, 10)), 50),
    );
    return ApiResponse.success({
      lang: resolveLang(acceptLanguage),
      messageKey: 'entity.LIST',
      data,
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PUBLIC — get full entity profile by id
  // ══════════════════════════════════════════════════════════════════════════

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.USER)
  @ApiOperation({ summary: 'Get full entity profile (public)' })
  @ApiQuery({ name: 'type', enum: EntityType, required: true })
  async getEntityProfile(
    @Param('id') id: string,
    @Query('type') type: EntityType,
    @Headers('accept-language') acceptLanguage?: string,
  ) {
    const data = await this.service.getEntityProfile(id, type);
    return ApiResponse.success({
      lang: resolveLang(acceptLanguage),
      messageKey: 'entity.PROFILE_FETCHED',
      data,
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ADMIN — approve / reject entity profile
  // ══════════════════════════════════════════════════════════════════════════

  @Patch(':id/review')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin: approve or reject an entity profile' })
  @ApiQuery({ name: 'type', enum: EntityType, required: true })
  @ApiBody({ type: ReviewEntityDto })
  async reviewEntity(
    @Param('id') id: string,
    @Query('type') type: EntityType,
    @Body() dto: ReviewEntityDto,
    @Headers('accept-language') acceptLanguage?: string,
  ) {
    if (dto.action === 'reject' && !dto.rejectionReason?.trim()) {
      throw new BadRequestException('entity.REJECTION_REASON_REQUIRED');
    }
    const data = await this.service.reviewEntity(id, type, dto);
    return ApiResponse.success({
      lang: resolveLang(acceptLanguage),
      messageKey:
        dto.action === 'approve' ? 'entity.APPROVED' : 'entity.REJECTED',
      data,
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PUBLIC — get gallery
  // ══════════════════════════════════════════════════════════════════════════

  @Get(':id/gallery')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.USER)
  @ApiOperation({ summary: 'Get entity gallery (public)' })
  @ApiQuery({ name: 'type', enum: EntityType, required: true })
  async getGallery(
    @Param('id') id: string,
    @Query('type') type: EntityType,
    @Headers('accept-language') acceptLanguage?: string,
  ) {
    const gallery = await this.service.getGallery(id, type);
    return ApiResponse.success({
      lang: resolveLang(acceptLanguage),
      messageKey: 'entity.GALLERY_FETCHED',
      data: { gallery, total: gallery.length },
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // OWNER — upload gallery images (goes directly into gallery)
  // ══════════════════════════════════════════════════════════════════════════

  @Post(':id/gallery')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DOCTOR, UserRole.HOSPITAL, UserRole.CENTER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Entity owner: upload gallery images' })
  @ApiConsumes('multipart/form-data')
  @ApiQuery({ name: 'type', enum: EntityType, required: true })
  @ApiBody({ type: AddGalleryDto })
  @UseInterceptors(galleryInterceptor(10))
  async uploadGallery(
    @Param('id') id: string,
    @Query('type') type: EntityType,
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser('accountId') accountId: string,
    @Headers('accept-language') acceptLanguage?: string,
  ) {
    if (!files?.length)
      throw new BadRequestException('entity.NO_FILES_UPLOADED');

    await this.service.assertEntityOwner(id, type, accountId);

    const imagePaths = files.map(
      (f) => `uploads/${type}s/gallery/${f.filename}`,
    );
    const gallery = await this.service.addGallery(id, type, imagePaths);
    return ApiResponse.success({
      lang: resolveLang(acceptLanguage),
      messageKey: 'entity.GALLERY_UPDATED',
      data: { gallery, total: gallery.length },
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // OWNER — remove own gallery images
  // ══════════════════════════════════════════════════════════════════════════

  @Delete(':id/gallery')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DOCTOR, UserRole.HOSPITAL, UserRole.CENTER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Entity owner: remove specific gallery images' })
  @ApiQuery({ name: 'type', enum: EntityType, required: true })
  @ApiBody({ type: RemoveGalleryDto })
  async removeGallery(
    @Param('id') id: string,
    @Query('type') type: EntityType,
    @Body() dto: RemoveGalleryDto,
    @CurrentUser('accountId') accountId: string,
    @Headers('accept-language') acceptLanguage?: string,
  ) {
    await this.service.assertEntityOwner(id, type, accountId);
    const gallery = await this.service.removeGallery(id, type, dto.images);

    dto.images.forEach((p) => {
      const fp = join(process.cwd(), p);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    });

    return ApiResponse.success({
      lang: resolveLang(acceptLanguage),
      messageKey: 'entity.GALLERY_UPDATED',
      data: { gallery, total: gallery.length },
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ADMIN — remove any gallery images
  // ══════════════════════════════════════════════════════════════════════════

  @Delete(':id/gallery/admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Admin: remove specific gallery images from any entity',
  })
  @ApiQuery({ name: 'type', enum: EntityType, required: true })
  @ApiBody({ type: RemoveGalleryDto })
  async adminRemoveGallery(
    @Param('id') id: string,
    @Query('type') type: EntityType,
    @Body() dto: RemoveGalleryDto,
    @Headers('accept-language') acceptLanguage?: string,
  ) {
    const gallery = await this.service.removeGallery(id, type, dto.images);
    dto.images.forEach((p) => {
      const fp = join(process.cwd(), p);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    });
    return ApiResponse.success({
      lang: resolveLang(acceptLanguage),
      messageKey: 'entity.GALLERY_UPDATED',
      data: { gallery, total: gallery.length },
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ADMIN — clear entire gallery
  // ══════════════════════════════════════════════════════════════════════════

  @Delete(':id/gallery/all')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin: clear entire gallery for an entity' })
  @ApiQuery({ name: 'type', enum: EntityType, required: true })
  async clearGallery(
    @Param('id') id: string,
    @Query('type') type: EntityType,
    @Headers('accept-language') acceptLanguage?: string,
  ) {
    const existing = await this.service.getGallery(id, type);
    await this.service.clearGallery(id, type);
    existing.forEach((p) => {
      const fp = join(process.cwd(), p);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    });
    return ApiResponse.success({
      lang: resolveLang(acceptLanguage),
      messageKey: 'entity.GALLERY_CLEARED',
      data: { gallery: [], total: 0 },
    });
  }
}
