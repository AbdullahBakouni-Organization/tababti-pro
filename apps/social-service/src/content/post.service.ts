import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Post } from '@app/common/database/schemas/post.schema';
import { CreatePostDto } from './dto/create-post.dto';
import { UserRole } from '@app/common/database/schemas/common.enums';
import { User } from '@app/common/database/schemas/user.schema';
import { Doctor } from '@app/common/database/schemas/doctor.schema';
import { Hospital } from '@app/common/database/schemas/hospital.schema';
import { Center } from '@app/common/database/schemas/center.schema';

@Injectable()
export class PostService {
  constructor(
    @InjectModel(Post.name) private readonly postModel: Model<Post>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(Doctor.name) private readonly doctorModel: Model<Doctor>,
    @InjectModel(Hospital.name) private readonly hospitalModel: Model<Hospital>,
    @InjectModel(Center.name) private readonly centerModel: Model<Center>,
  ) { }
  private async getAuthor(authAccountId: string, role: UserRole) {
    if (!Types.ObjectId.isValid(authAccountId)) {
      throw new BadRequestException('Invalid ID');
    }

    const authObjectId = new Types.ObjectId(authAccountId);
    let author: any = null;

    switch (role) {
      case UserRole.USER:
        author = await this.userModel
          .findOne({ authAccountId: authObjectId })
          .lean();
        break;

      case UserRole.DOCTOR:
        author = await this.doctorModel
          .findOne({ authAccountId: authObjectId })
          .lean();
        break;

      case UserRole.HOSPITAL:
        author = await this.hospitalModel
          .findOne({ authAccountId: authObjectId })
          .lean();
        break;

      case UserRole.CENTER:
        author = await this.centerModel
          .findOne({ authAccountId: authObjectId })
          .lean();
        break;
    }

    if (!author) {
      throw new NotFoundException('author.NOT_FOUND');
    }

    return author;
  }

  private formatAuthorName(author: any, role: UserRole): string {
    if (!author) return 'Unknown';
    switch (role) {
      case UserRole.DOCTOR:
        return (
          [author.firstName, author.middleName, author.lastName]
            .filter(Boolean)
            .join(' ') || 'Unknown'
        );
      case UserRole.HOSPITAL:
      case UserRole.CENTER:
        return author.name || 'Unknown';
      case UserRole.USER:
        return author.username || 'Unknown';
      default:
        return 'Unknown';
    }
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

  async create(
    dto: CreatePostDto,
    images: string[],
    authAccountId: string,
    role: UserRole,
  ) {
    if (!dto.content && images.length === 0)
      throw new BadRequestException('post.INVALID_CONTENT');

    const author = await this.getAuthor(authAccountId, role);

    // Set status to PENDING by default
    const post = await this.postModel.create({
      authorId: author._id,
      authorType: role,
      content: dto.content,
      images,
      status: 'pending',
      subscriptionType: dto.subscriptionType,
      usageCount: 0,
    });

    return {
      ...post.toObject(),
      authorName: this.formatAuthorName(author, post.authorType),
      authorImage: author?.avatar || author?.image || null,
    };
  }

  async findOne(id: string) {
    if (!Types.ObjectId.isValid(id))
      throw new BadRequestException('post.INVALID_ID');

    const post = await this.postModel.findById(id).lean();
    if (!post) throw new NotFoundException('post.NOT_FOUND');

    const authorModel = this.getAuthorModel(post.authorType);
    const author = await authorModel.findById(post.authorId).lean();

    return {
      ...post,
      authorName: this.formatAuthorName(author, post.authorType),
      authorImage: author?.avatar || author?.image || null,
    };
  }

  async remove(id: string, authAccountId: string) {
    if (!Types.ObjectId.isValid(id))
      throw new BadRequestException('post.INVALID_ID');

    const post = await this.postModel.findById(id);
    if (!post) throw new NotFoundException('post.NOT_FOUND');

    const author = await this.getAuthor(authAccountId, post.authorType);
    if (post.authorId.toString() !== author._id.toString())
      throw new ForbiddenException('post.FORBIDDEN');

    await post.deleteOne();
    return { message: 'post.DELETED_SUCCESS' };
  }

  async getPostsByAuthor(authorId: string) {
    if (!Types.ObjectId.isValid(authorId)) {
      throw new BadRequestException('user.INVALID_ID');
    }

    const authorExists =
      (await this.userModel.findById(authorId)) ||
      (await this.doctorModel.findById(authorId)) ||
      (await this.hospitalModel.findById(authorId)) ||
      (await this.centerModel.findById(authorId));

    if (!authorExists) {
      throw new NotFoundException('user.NOT_FOUND');
    }

    const posts = await this.postModel
      .find({ authorId: new Types.ObjectId(authorId) })
      .sort({ createdAt: -1 })
      .lean();

    return Promise.all(
      posts.map(async (post) => {
        const authorModel = this.getAuthorModel(post.authorType);
        const author = await authorModel.findById(post.authorId).lean();

        return {
          ...post,
          authorName: this.formatAuthorName(author, post.authorType),
          authorImage: author?.avatar || author?.image || null,
        };
      }),
    );
  }

  async getMyPosts(authAccountId: string, role: UserRole) {
    const author = await this.getAuthor(authAccountId, role);

    return this.postModel
      .find({ authorId: author._id })
      .sort({ createdAt: -1 });
  }
}
