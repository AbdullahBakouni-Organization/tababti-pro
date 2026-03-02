import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
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

@Injectable()
export class PostService {
  constructor(
    private readonly postRepo: PostRepository,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(Doctor.name) private readonly doctorModel: Model<Doctor>,
    @InjectModel(Hospital.name) private readonly hospitalModel: Model<Hospital>,
    @InjectModel(Center.name) private readonly centerModel: Model<Center>,
  ) { }

  /* ======================================================
      CREATE
  ====================================================== */
  async create(
    dto: CreatePostDto,
    images: string[],
    authAccountId: string,
    role: UserRole,
  ) {
    if (!dto.content?.trim() && images.length === 0) {
      throw new BadRequestException('post.INVALID_CONTENT');
    }

    const author = await this.getAuthor(authAccountId, role);

    return this.postRepo.create({
      authorId: author._id,
      authorType: role,
      content: dto.content,
      images,
      status: PostStatus.PENDING,
      subscriptionType: dto.subscriptionType,
      usageCount: 0,
      likedBy: [],
      likesCount: 0,
    });
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
    const authorProfileId = (author as any)._id.toString();

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

    // Compare profile _id (what likedBy stores) — not authAccountId
    const isLiked = profileObjectId
      ? (post.likedBy ?? []).some(
        (id: Types.ObjectId) => id.toString() === profileObjectId.toString(),
      )
      : false;

    // Strip likedBy — never expose the full array to clients
    const { likedBy: _likedBy, ...safePost } = post as any;

    return { ...safePost, isLiked };
  }

  /* ======================================================
      DELETE POST
  ====================================================== */
  async remove(postId: string, authAccountId: string, role: UserRole) {
    const post = await this.postRepo.findOne(postId);

    if (!post) {
      throw new NotFoundException('post.NOT_FOUND');
    }

    const model = this.getAuthorModel(post.authorType as UserRole);
    const author = await model
      .findOne({ authAccountId: new Types.ObjectId(authAccountId) })
      .lean();

    if (
      !author ||
      post.authorId.toString() !== (author as any)._id.toString()
    ) {
      throw new ForbiddenException('post.FORBIDDEN');
    }

    return this.postRepo.delete(postId);
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
    const profileId = (author as any)._id.toString();

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

      return profile ? (profile as any)._id.toString() : null;
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
}
