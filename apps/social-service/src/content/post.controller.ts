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
import { ApiBearerAuth } from '@nestjs/swagger';
import { ApiResponse } from '../common/response/api-response';
import * as fs from 'fs';

@Controller('posts')
export class PostController {
  constructor(private readonly postService: PostService) {}

  @Post()
  @UseInterceptors(
    FileFieldsInterceptor(
      [{ name: 'images', maxCount: 5 }],
      doctorImageOptions,
    ),
  )
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.USER, UserRole.DOCTOR, UserRole.HOSPITAL, UserRole.CENTER)

  async create(
    @UploadedFiles() files: { images?: Express.Multer.File[] },
    @Body() dto: CreatePostDto,
    @CurrentUser('id') authAccountId: string,
    @CurrentUser('role') role: UserRole,
    @Headers('accept-language') lang: 'en' | 'ar' = 'en',
  ) {
    try {
      const imagePaths =
        files.images?.map((f) => f.path.replace(/\\/g, '/')) || [];
      const post = await this.postService.create(
        dto,
        imagePaths,
        authAccountId,
        role,
      );
      return ApiResponse.success({
        lang,
        messageKey: 'post.CREATED',
        data: post,
      });
    } catch (error) {
      if (files.images?.length) {
        files.images.forEach((file) => {
          if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
        });
      }
      throw error;
    }
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.USER, UserRole.DOCTOR, UserRole.HOSPITAL, UserRole.CENTER)

  async findAll(@Headers('accept-language') lang: 'en' | 'ar' = 'en') {
    const posts = await this.postService.findAll();
    return ApiResponse.success({ lang, messageKey: 'post.LIST', data: posts });
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.USER, UserRole.DOCTOR, UserRole.HOSPITAL, UserRole.CENTER)

  async findOne(
    @Param('id') id: string,
    @Headers('accept-language') lang: 'en' | 'ar' = 'en',
  ) {
    const post = await this.postService.findOne(id);
    return ApiResponse.success({ lang, messageKey: 'post.FOUND', data: post });
  }

  @Patch(':id')
  @UseInterceptors(
    FileFieldsInterceptor(
      [{ name: 'images', maxCount: 5 }],
      doctorImageOptions,
    ),
  )
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.USER, UserRole.DOCTOR, UserRole.HOSPITAL, UserRole.CENTER)

  async update(
    @Param('id') id: string,
    @UploadedFiles() files: { images?: Express.Multer.File[] },
    @Body() dto: Partial<CreatePostDto>,
    @CurrentUser('id') authAccountId: string,
    @CurrentUser('role') role: UserRole,
    @Headers('accept-language') lang: 'en' | 'ar' = 'en',
  ) {
    try {
      const imagePaths =
        files.images?.map((f) => f.path.replace(/\\/g, '/')) || [];
      const post = await this.postService.update(
        id,
        dto,
        imagePaths,
        authAccountId,
        role,
      );
      return ApiResponse.success({
        lang,
        messageKey: 'post.UPDATED',
        data: post,
      });
    } catch (error) {
      if (files.images?.length) {
        files.images.forEach((file) => {
          if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
        });
      }
      throw error;
    }
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.USER, UserRole.DOCTOR, UserRole.HOSPITAL, UserRole.CENTER)

  async remove(
    @Param('id') id: string,
    @CurrentUser('id') authAccountId: string,
    @Headers('accept-language') lang: 'en' | 'ar' = 'en',
  ) {
    const result = await this.postService.remove(id, authAccountId);
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
    try {
      const posts = await this.postService.getPostsByAuthor(authorId);

      return ApiResponse.success({
        lang,
        messageKey: 'post.FETCHED',
        data: posts.length ? posts : [],
      });
    } catch (error) {
      if (error instanceof BadRequestException) {
        return ApiResponse.error({ lang, messageKey: 'user.INVALID_ID' });
      }
      if (error instanceof NotFoundException) {
        return ApiResponse.error({ lang, messageKey: 'user.NOT_FOUND' });
      }

      return ApiResponse.error({ lang, messageKey: 'common.ERROR' });
    }
  }
}
