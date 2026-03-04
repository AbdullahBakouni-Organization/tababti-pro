import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UploadedFiles,
  UseInterceptors,
  UseGuards,
  Headers,
  BadRequestException,
  Logger,
  Query,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { PostService } from './post.service';
import { CreatePostDto } from './dto/create-post.dto';
import { doctorImageOptions } from '@app/common/helpers/file-upload.helper';
import { JwtAuthGuard } from '@app/common/guards/jwt.guard';
import { RolesGuard } from '@app/common/guards/role.guard';
import { Roles } from '@app/common/decorator/role.decorator';
import {
  UserRole,
  PostStatus,
} from '@app/common/database/schemas/common.enums';
import { CurrentUser } from '@app/common/decorator/current-user.decorator';
import { ApiResponse } from '../common/response/api-response';
import { Types } from 'mongoose';
import * as fs from 'fs';

@Controller('posts')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PostController {
  private readonly logger = new Logger(PostController.name);

  constructor(private readonly postService: PostService) {}

  /* ======================================================
      CREATE POST
  ====================================================== */
  @Post()
  @Roles(UserRole.DOCTOR, UserRole.HOSPITAL, UserRole.CENTER)
  @UseInterceptors(
    FileFieldsInterceptor(
      [{ name: 'images', maxCount: 5 }],
      doctorImageOptions,
    ),
  )
  async create(
    @UploadedFiles() files: { images?: Express.Multer.File[] },
    @Body() dto: CreatePostDto,
    @CurrentUser('accountId') accountId: string,
    @CurrentUser('role') role: UserRole,
    @Headers('accept-language') lang: 'en' | 'ar' = 'en',
  ) {
    try {
      if (!Types.ObjectId.isValid(accountId)) {
        throw new BadRequestException('user.INVALID_ID');
      }

      const imagePaths =
        files?.images?.map((f) => f.path.replace(/\\/g, '/')) ?? [];

      const post = await this.postService.create(
        dto,
        imagePaths,
        accountId,
        role,
      );

      return ApiResponse.success({
        lang,
        messageKey: 'post.CREATED',
        data: post,
      });
    } catch (error) {
      this.logger.error('Create post error', error);

      if (files?.images?.length) {
        for (const file of files.images) {
          try {
            if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
          } catch (unlinkErr) {
            this.logger.warn(
              `Failed to delete uploaded file: ${file.path}`,
              unlinkErr,
            );
          }
        }
      }

      throw error;
    }
  }

  /* ======================================================
      GET ALL POSTS (FEED)
      FIX: Pass role so service can resolve profile _id for isLiked
  ====================================================== */
  @Get()
  @Roles(UserRole.USER, UserRole.DOCTOR, UserRole.HOSPITAL, UserRole.CENTER)
  async getAllPosts(
    @CurrentUser('accountId') accountId: string,
    @CurrentUser('role') role: UserRole, // ✅ added
    @Query('page') page = '1',
    @Query('limit') limit = '10',
    @Headers('accept-language') lang: 'en' | 'ar' = 'en',
  ) {
    const pageNumber = Math.max(1, parseInt(page, 10));
    const limitNumber = Math.min(Math.max(1, parseInt(limit, 10)), 50);

    const result = await this.postService.getAllPosts(
      accountId,
      role, // ✅ passed
      pageNumber,
      limitNumber,
    );

    return ApiResponse.success({
      lang,
      messageKey: 'post.FETCHED',
      data: result,
    });
  }

  /* ======================================================
      GET MY POSTS (with optional status filter)
  ====================================================== */
  @Get('me')
  @Roles(UserRole.DOCTOR, UserRole.HOSPITAL, UserRole.CENTER)
  async getMyPosts(
    @CurrentUser('accountId') accountId: string,
    @CurrentUser('role') role: UserRole,
    @Query('page') page = '1',
    @Query('limit') limit = '10',
    @Query('status') status?: PostStatus,
    @Headers('accept-language') lang: 'en' | 'ar' = 'en',
  ) {
    if (!Types.ObjectId.isValid(accountId)) {
      return ApiResponse.error({ lang, messageKey: 'user.INVALID_ID' });
    }

    if (status && !Object.values(PostStatus).includes(status)) {
      return ApiResponse.error({ lang, messageKey: 'post.INVALID_STATUS' });
    }

    const pageNumber = Math.max(1, parseInt(page, 10));
    const limitNumber = Math.min(Math.max(1, parseInt(limit, 10)), 50);

    const result = await this.postService.getMyPosts(
      accountId,
      role,
      pageNumber,
      limitNumber,
      status,
    );

    return ApiResponse.success({
      lang,
      messageKey: 'post.FETCHED',
      data: result,
    });
  }

  /* ======================================================
      GET POSTS BY AUTHOR
      FIX: Pass role so service can resolve profile _id for isLiked
  ====================================================== */
  @Get('author/:authorId')
  @Roles(UserRole.USER, UserRole.DOCTOR, UserRole.HOSPITAL, UserRole.CENTER)
  async getPostsByAuthor(
    @Param('authorId') authorId: string,
    @CurrentUser('accountId') accountId: string,
    @CurrentUser('role') role: UserRole, // ✅ added
    @Query('page') page = '1',
    @Query('limit') limit = '10',
    @Headers('accept-language') lang: 'en' | 'ar' = 'en',
  ) {
    if (!Types.ObjectId.isValid(authorId)) {
      return ApiResponse.error({ lang, messageKey: 'user.INVALID_ID' });
    }

    const pageNumber = Math.max(1, parseInt(page, 10));
    const limitNumber = Math.min(Math.max(1, parseInt(limit, 10)), 50);

    const result = await this.postService.getPostsByAuthor(
      authorId,
      accountId,
      role, // ✅ passed
      pageNumber,
      limitNumber,
    );

    return ApiResponse.success({
      lang,
      messageKey: 'post.FETCHED',
      data: result,
    });
  }

  /* ======================================================
      GET SINGLE POST
      FIX: Pass role so service can resolve profile _id for isLiked
  ====================================================== */
  @Get(':id')
  @Roles(UserRole.USER, UserRole.DOCTOR, UserRole.HOSPITAL, UserRole.CENTER)
  async findOne(
    @Param('id') id: string,
    @CurrentUser('accountId') accountId: string,
    @CurrentUser('role') role: UserRole, // ✅ added
    @Headers('accept-language') lang: 'en' | 'ar' = 'en',
  ) {
    if (!Types.ObjectId.isValid(id)) {
      return ApiResponse.error({ lang, messageKey: 'post.INVALID_ID' });
    }

    const post = await this.postService.findOne(id, accountId, role); // ✅ role passed

    return ApiResponse.success({ lang, messageKey: 'post.FOUND', data: post });
  }

  /* ======================================================
      DELETE POST
  ====================================================== */
  @Delete(':id')
  @Roles(UserRole.DOCTOR, UserRole.HOSPITAL, UserRole.CENTER)
  async remove(
    @Param('id') id: string,
    @CurrentUser('accountId') accountId: string,
    @CurrentUser('role') role: UserRole,
    @Headers('accept-language') lang: 'en' | 'ar' = 'en',
  ) {
    if (!Types.ObjectId.isValid(id) || !Types.ObjectId.isValid(accountId)) {
      return ApiResponse.error({ lang, messageKey: 'user.INVALID_ID' });
    }

    await this.postService.remove(id, accountId, role);

    return ApiResponse.success({
      lang,
      messageKey: 'post.DELETED',
      data: null,
    });
  }

  /* ======================================================
      TOGGLE LIKE
  ====================================================== */
  @Patch(':id/like')
  @Roles(UserRole.USER, UserRole.DOCTOR, UserRole.HOSPITAL, UserRole.CENTER)
  async toggleLike(
    @Param('id') id: string,
    @CurrentUser('accountId') accountId: string,
    @CurrentUser('role') role: UserRole,
    @Headers('accept-language') lang: 'en' | 'ar' = 'en',
  ) {
    if (!Types.ObjectId.isValid(id) || !Types.ObjectId.isValid(accountId)) {
      return ApiResponse.error({ lang, messageKey: 'post.INVALID_ID' });
    }

    const result = await this.postService.toggleLike(id, accountId, role);

    return ApiResponse.success({
      lang,
      messageKey: 'post.LIKE_UPDATED',
      data: result,
    });
  }
}
