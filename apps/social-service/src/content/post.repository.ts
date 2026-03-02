import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Post } from '@app/common/database/schemas/post.schema';
import { PostStatus } from '@app/common/database/schemas/common.enums';

@Injectable()
export class PostRepository {
  constructor(
    @InjectModel(Post.name) private readonly postModel: Model<Post>,
  ) { }

  /* ======================================================
      CREATE
  ====================================================== */
  async create(postData: Partial<Post>) {
    const post = await this.postModel.create(postData);
    return post.toObject();
  }

  /* ======================================================
      FIND ALL (FEED) — APPROVED posts only, paginated
  ====================================================== */
  async findAll(currentUserId: string | null, page = 1, limit = 10) {
    const skip = (page - 1) * limit;

    const currentUserObjectId =
      currentUserId && Types.ObjectId.isValid(currentUserId)
        ? new Types.ObjectId(currentUserId)
        : null;

    const result = await this.postModel.aggregate([
      { $match: { status: PostStatus.APPROVED } },
      { $sort: { createdAt: -1 } },
      {
        $facet: {
          data: [
            { $skip: skip },
            { $limit: limit },
            { $addFields: { likedBy: { $ifNull: ['$likedBy', []] } } },
            {
              $addFields: {
                isLiked: currentUserObjectId
                  ? { $in: [currentUserObjectId, '$likedBy'] }
                  : false,
              },
            },
            { $project: { likedBy: 0 } },
          ],
          totalCount: [{ $count: 'count' }],
        },
      },
    ]);

    const posts = result[0]?.data ?? [];
    const total = result[0]?.totalCount[0]?.count ?? 0;

    return {
      data: posts,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /* ======================================================
      FIND MY POSTS
      - authorId   : the resolved _id of the author profile
      - status     : optional filter; omit to return all statuses
      - isLiked    : included for consistency with other endpoints
      - likedBy    : always stripped before returning
  ====================================================== */
  async findMyPosts(
    authorId: string,
    page = 1,
    limit = 10,
    status?: PostStatus,
  ) {
    if (!Types.ObjectId.isValid(authorId)) {
      throw new BadRequestException('user.INVALID_ID');
    }

    const skip = (page - 1) * limit;
    const authorObjectId = new Types.ObjectId(authorId);

    // Build the match stage dynamically — include status only when provided
    const matchStage: Record<string, any> = { authorId: authorObjectId };
    if (status) {
      matchStage.status = status;
    }

    const result = await this.postModel.aggregate([
      { $match: matchStage },
      { $sort: { createdAt: -1 } },
      {
        $facet: {
          data: [
            { $skip: skip },
            { $limit: limit },
            { $addFields: { likedBy: { $ifNull: ['$likedBy', []] } } },
            {
              // Author can see their own posts' like count but not who liked
              $addFields: {
                isLiked: false, // owner viewing own post — isLiked not meaningful
              },
            },
            { $project: { likedBy: 0 } },
          ],
          totalCount: [{ $count: 'count' }],
          // Extra: count breakdown by status so the UI can show badges
          // e.g. { PENDING: 3, APPROVED: 10, REJECTED: 1 }
          statusSummary: [
            {
              $group: {
                _id: '$status',
                count: { $sum: 1 },
              },
            },
          ],
        },
      },
    ]);

    const posts = result[0]?.data ?? [];
    const total = result[0]?.totalCount[0]?.count ?? 0;

    // Transform statusSummary array → object for easy frontend consumption
    const statusSummary = (result[0]?.statusSummary ?? []).reduce(
      (acc: Record<string, number>, item: { _id: string; count: number }) => {
        acc[item._id] = item.count;
        return acc;
      },
      {} as Record<string, number>,
    );

    return {
      data: posts,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
      statusSummary, // { PENDING: 3, APPROVED: 10, REJECTED: 1 }
    };
  }

  /* ======================================================
      FIND BY AUTHOR (public profile — APPROVED only)
  ====================================================== */
  async findByAuthor(
    authorId: string,
    currentUserId: string | null,
    page = 1,
    limit = 10,
  ) {
    if (!Types.ObjectId.isValid(authorId)) {
      throw new BadRequestException('user.INVALID_ID');
    }

    const skip = (page - 1) * limit;
    const authorObjectId = new Types.ObjectId(authorId);

    const currentUserObjectId =
      currentUserId && Types.ObjectId.isValid(currentUserId)
        ? new Types.ObjectId(currentUserId)
        : null;

    const result = await this.postModel.aggregate([
      { $match: { authorId: authorObjectId, status: PostStatus.APPROVED } },
      { $sort: { createdAt: -1 } },
      {
        $facet: {
          data: [
            { $skip: skip },
            { $limit: limit },
            { $addFields: { likedBy: { $ifNull: ['$likedBy', []] } } },
            {
              $addFields: {
                isLiked: currentUserObjectId
                  ? { $in: [currentUserObjectId, '$likedBy'] }
                  : false,
              },
            },
            { $project: { likedBy: 0 } },
          ],
          totalCount: [{ $count: 'count' }],
        },
      },
    ]);

    const posts = result[0]?.data ?? [];
    const total = result[0]?.totalCount[0]?.count ?? 0;

    return {
      data: posts,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /* ======================================================
      FIND ONE — full document (caller strips likedBy)
  ====================================================== */
  async findOne(postId: string) {
    if (!Types.ObjectId.isValid(postId)) {
      throw new BadRequestException('post.INVALID_ID');
    }

    return this.postModel.findById(postId).lean();
  }

  /* ======================================================
      DELETE
  ====================================================== */
  async delete(postId: string) {
    if (!Types.ObjectId.isValid(postId)) {
      throw new BadRequestException('post.INVALID_ID');
    }

    const post = await this.postModel.findById(postId);
    if (!post) return null;

    await post.deleteOne();
    return post.toObject();
  }

  /* ======================================================
      TOGGLE LIKE
      Uses a MongoDB query for membership check — avoids the
      ObjectId reference comparison bug of Array.includes()
  ====================================================== */
  async toggleLike(postId: string, userId: string) {
    if (!Types.ObjectId.isValid(postId) || !Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('post.INVALID_ID');
    }

    const postObjectId = new Types.ObjectId(postId);
    const userObjectId = new Types.ObjectId(userId);

    // Fetch the post first — we need both existence and likedBy array
    const post = await this.postModel.findById(postObjectId).lean();
    if (!post) return null;

    // Compare as strings to avoid ObjectId reference equality bug
    const alreadyLiked = (post.likedBy ?? []).some(
      (id) => id.toString() === userObjectId.toString(),
    );

    if (alreadyLiked) {
      // ✅ findOneAndUpdate with { new: true } returns the document AFTER the update
      // so likesCount is already decremented — no second query needed
      const updated = await this.postModel
        .findOneAndUpdate(
          { _id: postObjectId },
          { $pull: { likedBy: userObjectId }, $inc: { likesCount: -1 } },
          { new: true, projection: { likesCount: 1 } },
        )
        .lean();

      return { isLiked: false, likesCount: updated?.likesCount ?? 0 };
    }

    const updated = await this.postModel
      .findOneAndUpdate(
        { _id: postObjectId },
        { $addToSet: { likedBy: userObjectId }, $inc: { likesCount: 1 } },
        { new: true, projection: { likesCount: 1 } },
      )
      .lean();

    return { isLiked: true, likesCount: updated?.likesCount ?? 0 };
  }
  /* ======================================================
    APPROVE OR REJECT POST (Admin)
====================================================== */
  async updateStatus(postId: string, status: PostStatus.APPROVED | PostStatus.REJECTED, rejectionReason?: string) {
    if (!Types.ObjectId.isValid(postId)) {
      throw new BadRequestException('post.INVALID_ID');
    }

    const updateData: Record<string, any> = { status };
    if (status === PostStatus.REJECTED && rejectionReason) {
      updateData.rejectionReason = rejectionReason;
    }

    const updated = await this.postModel
      .findByIdAndUpdate(
        new Types.ObjectId(postId),
        { $set: updateData },
        { new: true },
      )
      .lean();

    if (!updated) throw new NotFoundException('post.NOT_FOUND');
    return updated;
  }
}
