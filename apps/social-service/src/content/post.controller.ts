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
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { PostService } from './post.service';
import { CreatePostDto } from './dto/create-post.dto';
import { doctorImageOptions } from '@app/common/helpers/file-upload.helper';
import { JwtAuthGuard } from '@app/common/guards/jwt.guard';
import { RolesGuard } from '@app/common/guards/role.guard';
import { Roles } from '@app/common/decorator/role.decorator';
import { UserRole } from '@app/common/database/schemas/common.enums';
import { CurrentUser } from '../../src/common/decorators/current-user.decorator';
import { ApiResponse } from '../common/response/api-response';
import { Types } from 'mongoose';
import * as fs from 'fs';

@Controller('posts')
export class PostController {
  private readonly logger = new Logger(PostController.name);

  constructor(private readonly postService: PostService) {}

  /** Create a new post */
  @Post()
  @UseInterceptors(
    FileFieldsInterceptor(
      [{ name: 'images', maxCount: 5 }],
      doctorImageOptions,
    ),
  )
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DOCTOR, UserRole.HOSPITAL, UserRole.CENTER)
  async create(
    @UploadedFiles() files: { images?: Express.Multer.File[] },
    @Body() dto: CreatePostDto,
    @CurrentUser('accountId') accountId: string,
    @CurrentUser('role') role: UserRole,
    @Headers('accept-language') lang: 'en' | 'ar' = 'en',
  ) {
    this.logger.log(`Creating post for accountId: ${accountId}`);
    try {
      if (!accountId || !Types.ObjectId.isValid(accountId)) {
        throw new BadRequestException('user.INVALID_ID');
      }

      const imagePaths =
        files.images?.map((f) => f.path.replace(/\\/g, '/')) || [];
      const post = await this.postService.create(
        dto,
        imagePaths,
        accountId,
        role,
      );

      this.logger.log(`Post created: ${post._id}`);
      return ApiResponse.success({
        lang,
        messageKey: 'post.CREATED',
        data: post,
      });
    } catch (error) {
      this.logger.error('Error creating post', error);
      if (files.images?.length) {
        files.images.forEach((file) => {
          if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
        });
      }
      throw error;
    }
  }

  @Get('me')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DOCTOR, UserRole.HOSPITAL, UserRole.CENTER)
  async getMyPosts(
    @CurrentUser('accountId') accountId: string,
    @CurrentUser('role') role: UserRole,
    @Headers('accept-language') lang: 'en' | 'ar' = 'en',
  ) {
    this.logger.log(`Fetching posts for current user accountId: ${accountId}`);
    if (!accountId || !Types.ObjectId.isValid(accountId)) {
      return ApiResponse.error({ lang, messageKey: 'user.INVALID_ID' });
    }

    try {
      const posts = await this.postService.getMyPosts(accountId, role);
      return ApiResponse.success({
        lang,
        messageKey: 'post.FETCHED',
        data: posts || [],
      });
    } catch (error) {
      this.logger.error(
        `Error fetching posts for accountId: ${accountId}`,
        error,
      );
      return ApiResponse.error({ lang, messageKey: 'common.ERROR' });
    }
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.USER, UserRole.DOCTOR, UserRole.HOSPITAL, UserRole.CENTER)
  async findOne(
    @Param('id') id: string,
    @Headers('accept-language') lang: 'en' | 'ar' = 'en',
  ) {
    this.logger.log(`Fetching post by id: ${id}`);
    if (!Types.ObjectId.isValid(id)) {
      return ApiResponse.error({ lang, messageKey: 'user.INVALID_ID' });
    }
    const post = await this.postService.findOne(id);
    if (!post) {
      return ApiResponse.error({ lang, messageKey: 'post.NOT_FOUND' });
    }
    return ApiResponse.success({ lang, messageKey: 'post.FOUND', data: post });
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DOCTOR, UserRole.HOSPITAL, UserRole.CENTER)
  async remove(
    @Param('id') id: string,
    @CurrentUser('accountId') accountId: string,
    @Headers('accept-language') lang: 'en' | 'ar' = 'en',
  ) {
    this.logger.log(`Deleting post ${id} by accountId: ${accountId}`);
    if (
      !Types.ObjectId.isValid(id) ||
      !accountId ||
      !Types.ObjectId.isValid(accountId)
    ) {
      return ApiResponse.error({ lang, messageKey: 'user.INVALID_ID' });
    }

    const result = await this.postService.remove(id, accountId);
    return ApiResponse.success({
      lang,
      messageKey: 'post.DELETED',
      data: null,
    });
  }

  @Get('author/:authorId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.USER, UserRole.DOCTOR, UserRole.HOSPITAL, UserRole.CENTER)
  async getPostsByAuthor(
    @Param('authorId') authorId: string,
    @Headers('accept-language') lang: 'en' | 'ar' = 'en',
  ) {
    this.logger.log(`Fetching posts by authorId: ${authorId}`);
    if (!Types.ObjectId.isValid(authorId)) {
      return ApiResponse.error({ lang, messageKey: 'user.INVALID_ID' });
    }

    try {
      const posts = await this.postService.getPostsByAuthor(authorId);
      return ApiResponse.success({
        lang,
        messageKey: 'post.FETCHED',
        data: posts || [],
      });
    } catch (error) {
      this.logger.error(`Error fetching posts for author ${authorId}`, error);
      return ApiResponse.error({ lang, messageKey: 'common.ERROR' });
    }
  }
}
