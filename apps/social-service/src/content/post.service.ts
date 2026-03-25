import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PostRepository } from './post.repository';
import { CreatePostDto } from './dto/create-post.dto';
import {
  UserRole,
  PostStatus,
} from '@app/common/database/schemas/common.enums';
import { Model, Types } from 'mongoose';
import { User } from '@app/common/database/schemas/user.schema';
import { Doctor } from '@app/common/database/schemas/doctor.schema';
import { Hospital } from '@app/common/database/schemas/hospital.schema';
import { Center } from '@app/common/database/schemas/center.schema';
import { InjectModel } from '@nestjs/mongoose';
import { PostStats } from './post.interface';
import { Post, PostDocument } from '@app/common/database/schemas/post.schema';
import { MinioService } from 'apps/home-service/src/minio/minio.service';
import { formatDate } from '@app/common/utils/get-syria-date';
import { invalidateProfileDoctorPostCaches } from '@app/common/utils/cache-invalidation.util';
import { CacheService } from '@app/common/cache/cache.service';

@Injectable()
export class PostService {
  private readonly logger = new Logger(PostService.name);
  constructor(
    private readonly postRepo: PostRepository,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(Doctor.name) private readonly doctorModel: Model<Doctor>,
    @InjectModel(Hospital.name) private readonly hospitalModel: Model<Hospital>,
    @InjectModel(Center.name) private readonly centerModel: Model<Center>,
    @InjectModel(Post.name) private readonly postModel: Model<Post>,
    private minioService: MinioService,
    private cacheService: CacheService,
  ) {}

  /**
   * Create post without images first
   * Images will be added after upload to MinIO
   */
  async createWithoutImages(
    dto: CreatePostDto,
    accountId: string,
    role: UserRole,
  ): Promise<PostDocument> {
    this.logger.log(`Creating post for account ${accountId}`);

    const post = await this.postModel.create({
      content: dto.content,
      authorId: new Types.ObjectId(accountId),
      authorType: role,
      status: PostStatus.PENDING,
      images: [], // Will be updated after MinIO upload
      imagesMetadata: [], // MinIO metadata
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await invalidateProfileDoctorPostCaches(
      this.cacheService,
      accountId,
      this.logger,
    );
    return post;
  }

  /**
   * Update post with image URLs from MinIO
   */
  async updatePostImages(
    postId: string,
    imagesData: Array<{
      url: string;
      fileName: string;
      bucket: string;
    }>,
  ): Promise<void> {
    this.logger.log(`Updating post ${postId} with ${imagesData.length} images`);

    if (!Types.ObjectId.isValid(postId)) {
      throw new NotFoundException('Invalid post ID');
    }

    const post = await this.postModel.findById(postId).exec();
    if (!post) {
      throw new NotFoundException('Post not found');
    }

    // Update with URLs and metadata
    post.images = imagesData.map((img) => img.url);
    post.imagesMetadata = imagesData.map((img) => ({
      url: img.url,
      fileName: img.fileName,
      bucket: img.bucket,
      uploadedAt: new Date(),
    }));
    post.updatedAt = new Date();

    await post.save();

    this.logger.log(`Post ${postId} updated with images`);
  }

  /* ======================================================
      GET ALL POSTS (FEED — APPROVED only)
      FIX: Resolve profile _id from authAccountId+role so the
      aggregation $in check on likedBy matches correctly.
  ====================================================== */
  async getAllPosts(
    authAccountId: string,
    role: UserRole,
    page = 1,
    limit = 10,
  ) {
    const profileId = await this.resolveProfileId(authAccountId, role);
    return this.postRepo.findAll(profileId, page, limit);
  }

  /* ======================================================
      GET MY POSTS
  ====================================================== */
  async getMyPosts(
    authAccountId: string,
    role: UserRole,
    page = 1,
    limit = 10,
    status?: PostStatus,
  ) {
    const author = await this.getAuthor(authAccountId, role);
    const authorProfileId = author._id.toString();

    return this.postRepo.findMyPosts(authorProfileId, page, limit, status);
  }

  /* ======================================================
      GET POSTS BY AUTHOR (public — APPROVED only)
      FIX: Resolve profile _id for isLiked check.
  ====================================================== */
  async getPostsByAuthor(
    authorId: string,
    authAccountId: string,
    role: UserRole,
    page = 1,
    limit = 10,
  ) {
    const profileId = await this.resolveProfileId(authAccountId, role);
    return this.postRepo.findByAuthor(authorId, profileId, page, limit);
  }

  /* ======================================================
      GET SINGLE POST (APPROVED only)
      FIX: Resolve profile _id for isLiked check.
  ====================================================== */
  async findOne(postId: string, authAccountId: string, role: UserRole) {
    const post = await this.postRepo.findOne(postId);

    if (!post || post.status !== PostStatus.APPROVED) {
      throw new NotFoundException('post.NOT_FOUND');
    }

    const profileId = await this.resolveProfileId(authAccountId, role);
    const profileObjectId = profileId ? new Types.ObjectId(profileId) : null;

    const isLiked = profileObjectId
      ? (post.likedBy ?? []).some(
          (id: Types.ObjectId) => id.toString() === profileObjectId.toString(),
        )
      : false;

    // ✅ Resolve author name + image
    const author = await this.resolveAuthor(
      post.authorId.toString(),
      post.authorType,
    );

    const { likedBy: _likedBy, ...safePost } = post as any;
    return { ...safePost, isLiked, author };
  }

  private async resolveAuthor(authorId: string, role: UserRole) {
    try {
      const model = this.getAuthorModel(role);

      const profile = await model
        .findById(new Types.ObjectId(authorId), {
          firstName: 1, // Doctor ✅ (confirmed from schema)
          lastName: 1, // Doctor ✅
          name: 1, // Hospital / Center — adjust when you share those schemas
          image: 1, // All three ✅
        })
        .lean();

      if (!profile) return null;

      const name =
        role === UserRole.DOCTOR
          ? `${profile.firstName ?? ''} ${profile.lastName ?? ''}`.trim()
          : (profile.name ?? 'Unknown');

      return {
        _id: profile._id,
        name,
        image: profile.image ?? null,
        type: role,
      };
    } catch {
      return null;
    }
  }

  /* ======================================================
      DELETE POST
  ====================================================== */
  async remove(postId: string, authAccountId: string, role: UserRole) {
    const post = await this.postRepo.findOne(postId);

    if (!post) {
      throw new NotFoundException('post.NOT_FOUND');
    }

    const model = this.getAuthorModel(post.authorType);
    const author = await model
      .findOne({ authAccountId: new Types.ObjectId(authAccountId) })
      .lean();

    if (
      !author ||
      post.authorId.toString() !== author.authAccountId.toString()
    ) {
      throw new ForbiddenException('post.FORBIDDEN');
    }

    if (post.imagesMetadata?.length) {
      await this.deletePostImagesFromMinIO(post.imagesMetadata);
    }

    // delete post
    await this.postRepo.delete(postId);
    await invalidateProfileDoctorPostCaches(
      this.cacheService,
      authAccountId,
      this.logger,
    );
    this.logger.log(`Post ${postId} and all images deleted successfully`);

    return post;
  }

  /* ======================================================
      TOGGLE LIKE
      Resolves profile _id so likedBy stores consistent IDs.
  ====================================================== */
  async toggleLike(postId: string, accountId: string, role: UserRole) {
    const post = await this.postRepo.findOne(postId);

    if (!post || post.status !== PostStatus.APPROVED) {
      throw new NotFoundException('post.NOT_FOUND');
    }

    const author = await this.getAuthor(accountId, role);
    const profileId = author._id.toString();

    return this.postRepo.toggleLike(postId, profileId);
  }

  /* ======================================================
      PRIVATE HELPERS
  ====================================================== */

  /**
   * Resolves the profile _id for a given authAccountId + role.
   * Used by all READ endpoints to ensure the correct ID is passed
   * to the aggregation $in check on likedBy.
   * Returns null (not throws) when the profile isn't found so that
   * unauthenticated-style reads still work with isLiked = false.
   */
  private async resolveProfileId(
    authAccountId: string,
    role: UserRole,
  ): Promise<string | null> {
    if (!authAccountId || !Types.ObjectId.isValid(authAccountId)) return null;

    try {
      const model = this.getAuthorModel(role);
      const profile = await model
        .findOne(
          { authAccountId: new Types.ObjectId(authAccountId) },
          { _id: 1 }, // only fetch _id — keep the query lean
        )
        .lean();

      return profile ? profile._id.toString() : null;
    } catch {
      return null;
    }
  }

  private async getAuthor(authAccountId: string, role: UserRole) {
    if (!Types.ObjectId.isValid(authAccountId)) {
      throw new BadRequestException('user.INVALID_ID');
    }

    const model = this.getAuthorModel(role);
    const author = await model
      .findOne({ authAccountId: new Types.ObjectId(authAccountId) })
      .lean();

    if (!author) {
      throw new NotFoundException('author.NOT_FOUND');
    }

    return author;
  }

  private getAuthorModel(role: UserRole): Model<any> {
    switch (role) {
      case UserRole.USER:
        return this.userModel;
      case UserRole.DOCTOR:
        return this.doctorModel;
      case UserRole.HOSPITAL:
        return this.hospitalModel;
      case UserRole.CENTER:
        return this.centerModel;
      default:
        throw new ForbiddenException('post.FORBIDDEN');
    }
  }
  /* ======================================================
    APPROVE OR REJECT POST (Admin only)
====================================================== */
  async updatePostStatus(
    postId: string,
    status: PostStatus.APPROVED | PostStatus.REJECTED,
    role: UserRole,
    rejectionReason?: string,
  ) {
    if (role !== UserRole.ADMIN) {
      throw new ForbiddenException('post.FORBIDDEN');
    }

    const post = await this.postRepo.findOne(postId);
    if (!post) {
      throw new NotFoundException('post.NOT_FOUND');
    }

    if (post.status !== PostStatus.PENDING) {
      throw new BadRequestException('post.ALREADY_REVIEWED');
    }

    if (status === PostStatus.REJECTED && !rejectionReason?.trim()) {
      throw new BadRequestException('post.REJECTION_REASON_REQUIRED');
    }

    return this.postRepo.updateStatus(postId, status, rejectionReason);
  }
  // ══════════════════════════════════════════════════════════════
  // GET STATS
  //
  // • DOCTOR / HOSPITAL / CENTER → global stats + their own post metrics
  // • ADMIN                      → global stats only (no author profile)
  //
  // Mirrors the pattern used in QuestionsService.getStats().
  // ══════════════════════════════════════════════════════════════
  async getStats(authAccountId: string, role: UserRole): Promise<PostStats> {
    // Resolve the author's profile _id so the repo can scope author metrics.
    // resolveProfileId already handles invalid IDs gracefully (returns null).
    const profileId = await this.resolveProfileId(authAccountId, role);

    const authorProfileId =
      profileId && Types.ObjectId.isValid(profileId)
        ? new Types.ObjectId(profileId)
        : null;

    return this.postRepo.getStats(authorProfileId);
  }
  async deletePost(postId: string): Promise<void> {
    this.logger.log(`Deleting post ${postId}`);

    if (!Types.ObjectId.isValid(postId)) {
      return;
    }

    await this.postModel.findByIdAndDelete(postId).exec();

    this.logger.log(`Post ${postId} deleted`);
  }

  private async deletePostImagesFromMinIO(
    imagesMetadata: Array<{
      url: string;
      fileName: string;
      bucket: string;
    }>,
  ): Promise<void> {
    if (!imagesMetadata || imagesMetadata.length === 0) {
      return;
    }

    this.logger.log(`Deleting ${imagesMetadata.length} images from MinIO`);

    try {
      // Group by bucket (all should be same bucket)
      const bucket = imagesMetadata[0].bucket;
      const fileNames = imagesMetadata.map((img) => img.fileName);

      // Delete all images in one call
      await this.minioService.deleteFiles(bucket, fileNames);

      this.logger.log(
        `✅ Successfully deleted ${fileNames.length} images from MinIO`,
      );
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `❌ Failed to delete images from MinIO: ${err.message}`,
        err.stack,
      );
      // Don't throw - continue with post deletion even if MinIO cleanup fails
    }
  }

  async getApprovedPosts(page: number = 1, limit: number = 30) {
    const cacheKey = `approved_posts:page${page}:limit${limit}`;

    const cached =
      await this.cacheService.get<ReturnType<typeof this.getApprovedPosts>>(
        cacheKey,
      );
    if (cached) return cached;
    const skip = (page - 1) * limit;

    const [posts, total] = await Promise.all([
      this.postModel
        .find({ status: PostStatus.APPROVED })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.postModel.countDocuments({ status: PostStatus.APPROVED }),
    ]);

    // Collect all authorIds grouped by type
    const doctorIds: Types.ObjectId[] = [];
    const hospitalIds: Types.ObjectId[] = [];
    const centerIds: Types.ObjectId[] = [];

    for (const post of posts) {
      if (post.authorType === UserRole.DOCTOR) doctorIds.push(post.authorId);
      else if (post.authorType === UserRole.HOSPITAL)
        hospitalIds.push(post.authorId);
      else if (post.authorType === UserRole.CENTER)
        centerIds.push(post.authorId);
    }

    // Fetch all authors in parallel using authAccountId
    const [doctors, hospitals, centers] = await Promise.all([
      doctorIds.length
        ? this.doctorModel
            .find({ authAccountId: { $in: doctorIds } })
            .select('authAccountId firstName middleName lastName image gender')
            .lean()
        : [],
      hospitalIds.length
        ? this.hospitalModel
            .find({ authAccountId: { $in: hospitalIds } })
            .select('authAccountId name image')
            .lean()
        : [],
      centerIds.length
        ? this.centerModel
            .find({ authAccountId: { $in: centerIds } })
            .select('authAccountId name image')
            .lean()
        : [],
    ]);

    // Build lookup maps keyed by authAccountId string
    // Doctor map
    // Doctor map
    const doctorMap = new Map<
      string,
      { fullName: string; image: string | null; gender: string | null }
    >(
      doctors.map(
        (d) =>
          [
            d.authAccountId.toString(),
            {
              fullName: [d.firstName, d.middleName, d.lastName]
                .filter(Boolean)
                .join(' '),
              image: d.image ?? null,
              gender: d.gender ?? null,
            },
          ] as [
            string,
            { fullName: string; image: string | null; gender: string | null },
          ],
      ),
    );

    // Hospital map
    const hospitalMap = new Map<
      string,
      { fullName: string; image: string | null }
    >(
      hospitals.map(
        (h) =>
          [
            h.authAccountId.toString(),
            { fullName: h.name, image: h.image ?? null },
          ] as [string, { fullName: string; image: string | null }],
      ),
    );

    // Center map
    const centerMap = new Map<
      string,
      { fullName: string; image: string | null }
    >(
      centers.map(
        (c) =>
          [
            c.authAccountId.toString(),
            { fullName: c.name, image: c.image ?? null },
          ] as [string, { fullName: string; image: string | null }],
      ),
    );

    // Map posts to response
    const data = posts.map((post) => {
      const authorKey = post.authorId?.toString();
      let author: {
        fullName: string;
        image: string | null;
        gender?: string | null;
      } = {
        fullName: 'Unknown',
        image: null,
        gender: null, // ✅
      };

      if (post.authorType === UserRole.DOCTOR) {
        author = doctorMap.get(authorKey) ?? author;
      } else if (post.authorType === UserRole.HOSPITAL) {
        author = hospitalMap.get(authorKey) ?? author;
      } else if (post.authorType === UserRole.CENTER) {
        author = centerMap.get(authorKey) ?? author;
      }

      return {
        id: post._id,
        content: post.content || null,
        images: post.images || [],
        authorType: post.authorType,
        authorName: author.fullName,
        authorImage: author.image,
        authorGender: author.gender,
        createdAt: formatDate(post.createdAt!),
      };
    });

    const result = {
      posts: {
        data,
        total,
        meta: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
          hasNextPage: skip + posts.length < total,
          hasPreviousPage: page > 1,
        },
      },
    };

    // Cache for 5 min memory, 15 min Redis
    await this.cacheService.set(cacheKey, result, 120, 7200);

    return result;
  }
}
