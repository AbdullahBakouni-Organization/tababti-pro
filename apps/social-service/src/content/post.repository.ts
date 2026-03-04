import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Post } from '@app/common/database/schemas/post.schema';
import { PostStatus } from '@app/common/database/schemas/common.enums';
import { PostStats } from './post.interface';

@Injectable()
export class PostRepository {
  constructor(
    @InjectModel(Post.name) private readonly postModel: Model<Post>,
  ) {}

  // ══════════════════════════════════════════════════════════════
  // SHARED AUTHOR LOOKUP — injected into every data facet
  // Produces an `author` field: { _id, name, image, type }
  // ══════════════════════════════════════════════════════════════
  private get authorLookupStages() {
    return [
      {
        $lookup: {
          from: 'doctors',
          localField: 'authorId',
          foreignField: '_id',
          as: '_doctorAuthor',
          pipeline: [{ $project: { firstName: 1, lastName: 1, image: 1 } }],
        },
      },
      {
        $lookup: {
          from: 'hospitals', // ✅ adjust if your collection name differs
          localField: 'authorId',
          foreignField: '_id',
          as: '_hospitalAuthor',
          pipeline: [{ $project: { name: 1, image: 1 } }],
        },
      },
      {
        $lookup: {
          from: 'centers', // ✅ adjust if your collection name differs
          localField: 'authorId',
          foreignField: '_id',
          as: '_centerAuthor',
          pipeline: [{ $project: { name: 1, image: 1 } }],
        },
      },
      {
        $addFields: {
          _rawAuthor: {
            $arrayElemAt: [
              {
                $concatArrays: [
                  '$_doctorAuthor',
                  '$_hospitalAuthor',
                  '$_centerAuthor',
                ],
              },
              0,
            ],
          },
        },
      },
      {
        $addFields: {
          author: {
            _id: '$_rawAuthor._id',
            name: {
              $cond: {
                if: { $eq: ['$authorType', 'doctor'] },
                then: {
                  $trim: {
                    input: {
                      $concat: [
                        { $ifNull: ['$_rawAuthor.firstName', ''] },
                        ' ',
                        { $ifNull: ['$_rawAuthor.lastName', ''] },
                      ],
                    },
                  },
                },
                else: { $ifNull: ['$_rawAuthor.name', 'Unknown'] },
              },
            },
            image: { $ifNull: ['$_rawAuthor.image', null] },
            type: '$authorType',
          },
        },
      },
      {
        $project: {
          _doctorAuthor: 0,
          _hospitalAuthor: 0,
          _centerAuthor: 0,
          _rawAuthor: 0,
        },
      },
    ];
  }

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
            ...this.authorLookupStages, // ✅ author injected here
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

    const matchStage: Record<string, any> = { authorId: authorObjectId };
    if (status) matchStage.status = status;

    const result = await this.postModel.aggregate([
      { $match: matchStage },
      { $sort: { createdAt: -1 } },
      {
        $facet: {
          data: [
            { $skip: skip },
            { $limit: limit },
            { $addFields: { likedBy: { $ifNull: ['$likedBy', []] } } },
            { $addFields: { isLiked: false } },
            ...this.authorLookupStages, // ✅ author injected here
            { $project: { likedBy: 0 } },
          ],
          totalCount: [{ $count: 'count' }],
          statusSummary: [{ $group: { _id: '$status', count: { $sum: 1 } } }],
        },
      },
    ]);

    const posts = result[0]?.data ?? [];
    const total = result[0]?.totalCount[0]?.count ?? 0;

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
      statusSummary,
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
            ...this.authorLookupStages, // ✅ author injected here
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
      FIND ONE — full document (service strips likedBy + adds author)
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
  ====================================================== */
  async toggleLike(postId: string, userId: string) {
    if (!Types.ObjectId.isValid(postId) || !Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('post.INVALID_ID');
    }

    const postObjectId = new Types.ObjectId(postId);
    const userObjectId = new Types.ObjectId(userId);

    const post = await this.postModel.findById(postObjectId).lean();
    if (!post) return null;

    const alreadyLiked = (post.likedBy ?? []).some(
      (id) => id.toString() === userObjectId.toString(),
    );

    if (alreadyLiked) {
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
      UPDATE STATUS (Admin — approve / reject)
  ====================================================== */
  async updateStatus(
    postId: string,
    status: PostStatus.APPROVED | PostStatus.REJECTED,
    rejectionReason?: string,
  ) {
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

  /* ======================================================
      GET STATS
  ====================================================== */
  async getStats(authorProfileId: Types.ObjectId | null): Promise<PostStats> {
    function pct(part: number, total: number): number {
      if (total === 0) return 0;
      return Math.round((part / total) * 10_000) / 100;
    }

    const [globalResult, authorResult] = await Promise.all([
      this.postModel.aggregate([
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            totalLikes: { $sum: { $ifNull: ['$likesCount', 0] } },
          },
        },
      ]),
      authorProfileId
        ? this.postModel.aggregate([
            { $match: { authorId: authorProfileId } },
            {
              $group: {
                _id: null,
                myPostsCount: { $sum: 1 },
                myLikesReceived: { $sum: { $ifNull: ['$likesCount', 0] } },
              },
            },
          ])
        : Promise.resolve([]),
    ]);

    let total = 0,
      approved = 0,
      pending = 0,
      rejected = 0,
      totalLikes = 0;

    for (const row of globalResult) {
      total += row.count;
      totalLikes += row.totalLikes ?? 0;
      switch (row._id) {
        case 'approved':
          approved = row.count;
          break;
        case 'pending':
          pending = row.count;
          break;
        case 'rejected':
          rejected = row.count;
          break;
      }
    }

    return {
      total,
      approved,
      pending,
      rejected,
      approvedPercent: pct(approved, total),
      pendingPercent: pct(pending, total),
      rejectedPercent: pct(rejected, total),
      totalLikes,
      myPostsCount: authorResult[0]?.myPostsCount ?? 0,
      myLikesReceived: authorResult[0]?.myLikesReceived ?? 0,
    };
  }
}
