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
import { UpdatePostStatusDto } from './dto/update-post-status.dto';
import { ApiOperation } from '@nestjs/swagger';
import multer from 'multer';
import { MinioService } from 'apps/home-service/src/minio/minio.service';
const postImagesMemoryConfig = {
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB per image
  },
  fileFilter: (req: any, file: Express.Multer.File, cb: any) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    allowedTypes.includes(file.mimetype)
      ? cb(null, true)
      : cb(
          new BadRequestException(
            'Invalid file type. Allowed: JPEG, PNG, WEBP',
          ),
          false,
        );
  },
};
@Controller('posts')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PostController {
  private readonly logger = new Logger(PostController.name);

  constructor(
    private readonly postService: PostService,
    private minioService: MinioService,
  ) {}

  /* ======================================================
      CREATE POST
  ====================================================== */
  @Post()
  @Roles(UserRole.DOCTOR, UserRole.HOSPITAL, UserRole.CENTER)
  @UseInterceptors(
    FileFieldsInterceptor(
      [{ name: 'images', maxCount: 5 }],
      postImagesMemoryConfig,
    ),
  )
  async create(
    @UploadedFiles() files: { images?: Express.Multer.File[] },
    @Body() dto: CreatePostDto,
    @CurrentUser('accountId') accountId: string,
    @CurrentUser('role') role: UserRole,
    @Headers('accept-language') lang: 'en' | 'ar' = 'en',
  ) {
    // Validate account ID
    if (!Types.ObjectId.isValid(accountId)) {
      throw new BadRequestException('user.INVALID_ID');
    }

    let postId: string | undefined;
    let uploadedImageData: Array<{
      url: string;
      fileName: string;
      bucket: string;
    }> = [];

    try {
      // Step 1: Create post record first (without images)
      const post = await this.postService.createWithoutImages(
        dto,
        accountId,
        role,
      );
      postId = post._id.toString();

      this.logger.log(`Post created with ID: ${postId}`);

      // Step 2: Upload images to MinIO with correct postId
      if (files?.images?.length) {
        this.logger.log(
          `Uploading ${files.images.length} images for post ${postId}`,
        );

        uploadedImageData = await this.uploadPostImages(
          accountId,
          postId,
          files.images,
        );

        // Extract URLs
        const imageUrls = uploadedImageData.map((img) => img.url);

        // Step 3: Update post with image URLs and metadata
        await this.postService.updatePostImages(postId, uploadedImageData);

        post.images = imageUrls;
      }

      return ApiResponse.success({
        lang,
        messageKey: 'post.CREATED',
        data: post,
      });
    } catch (error) {
      this.logger.error('Create post error', error);

      // Cleanup on error
      if (postId) {
        // Delete post record
        await this.postService
          .deletePost(postId)
          .catch((err) =>
            this.logger.warn(`Failed to delete post: ${err.message}`),
          );
      }

      if (uploadedImageData.length > 0) {
        // Delete uploaded images from MinIO
        await this.cleanupUploadedImages(uploadedImageData);
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

  @Roles(UserRole.USER)
  @Get('all-approved-posts')
  async getApprovedPosts(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
  ) {
    return await this.postService.getApprovedPosts(+page, +limit);
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
  // ══════════════════════════════════════════════════════════════
  // GET /posts/stats
  //
  // DOCTOR / HOSPITAL / CENTER → global counts + their own metrics
  // ADMIN                      → global counts only
  //
  // Mirrors GET /questions/stats — same role set, same response shape.
  // ══════════════════════════════════════════════════════════════
  @Get('stats')
  @Roles(UserRole.DOCTOR, UserRole.HOSPITAL, UserRole.CENTER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Post statistics — counts, percentages, engagement',
    description:
      'Returns global post counts (total / approved / pending / rejected) ' +
      'with percentages and total likes.\n\n' +
      'For DOCTOR / HOSPITAL / CENTER roles, also returns `myPostsCount` ' +
      'and `myLikesReceived` scoped to the requesting author.',
  })
  async getStats(
    @CurrentUser('accountId') accountId: string,
    @CurrentUser('role') role: UserRole,
    @Headers('accept-language') lang: 'en' | 'ar' = 'en',
  ) {
    const data = await this.postService.getStats(accountId, role);
    return ApiResponse.success({ lang, messageKey: 'post.STATS', data });
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
  /* ======================================================
    APPROVE OR REJECT POST — Admin only
    PATCH /posts/:id/status
====================================================== */
  @Patch(':id/status')
  @Roles(UserRole.ADMIN)
  async updatePostStatus(
    @Param('id') postId: string,
    @Body() dto: UpdatePostStatusDto,
    @CurrentUser() user: { accountId: string; role: UserRole },
  ) {
    return this.postService.updatePostStatus(
      postId,
      dto.status,
      user.role,
      dto.rejectionReason,
    );
  }

  private async uploadPostImages(
    accountId: string,
    postId: string,
    files: Express.Multer.File[],
  ): Promise<Array<{ url: string; fileName: string; bucket: string }>> {
    const uploadedImages: Array<{
      url: string;
      fileName: string;
      bucket: string;
    }> = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      try {
        const folder = `posts/${accountId}/${postId}`;
        const result = await this.minioService.uploadFile(
          file,
          'general',
          folder,
        );

        uploadedImages.push({
          url: result.url,
          fileName: result.fileName,
          bucket: result.bucket,
        });

        this.logger.log(`Image ${i + 1}/${files.length} uploaded successfully`);
      } catch (error) {
        const err = error as Error;
        this.logger.error(
          `Failed to upload image ${i + 1}: ${err.message}`,
          err.stack,
        );

        // Cleanup already uploaded images
        await this.cleanupUploadedImages(uploadedImages);

        throw new BadRequestException(
          `Failed to upload image ${i + 1}: ${err.message}`,
        );
      }
    }

    return uploadedImages;
  }

  /**
   * Cleanup uploaded images on error
   */
  private async cleanupUploadedImages(
    images: Array<{ url: string; fileName: string; bucket: string }>,
  ): Promise<void> {
    if (!images.length) return;

    this.logger.log(`Cleaning up ${images.length} uploaded images from MinIO`);

    try {
      const fileNames = images.map((img) => img.fileName);
      const bucket = images[0].bucket; // All images in same bucket

      await this.minioService.deleteFiles(bucket, fileNames);
      this.logger.log('✅ Cleanup completed successfully');
    } catch (error) {
      const err = error as Error;
      this.logger.warn(`⚠️ Failed to cleanup images: ${err.message}`);
      // Don't throw - cleanup is best effort
    }
  }
}
