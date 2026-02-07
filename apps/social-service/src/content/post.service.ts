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
  ) {}

  private async getAuthor(authAccountId: string, role: UserRole) {
    const authObjectId = new Types.ObjectId(authAccountId);
    let author: any = null;

    switch (role) {
      case UserRole.USER:
        author = await this.userModel.findOne({ authAccountId: authObjectId });
        break;
      case UserRole.DOCTOR:
        author = await this.doctorModel.findOne({
          authAccountId: authObjectId,
        });
        break;
      case UserRole.HOSPITAL:
        author = await this.hospitalModel.findOne({
          authAccountId: authObjectId,
        });
        break;
      case UserRole.CENTER:
        author = await this.centerModel.findOne({
          authAccountId: authObjectId,
        });
        break;
    }

    if (!author) throw new NotFoundException('author.NOT_FOUND');
    return author;
  }

  async create(
    dto: CreatePostDto,
    images: string[],
    authAccountId: string,
    role: UserRole,
  ) {
    if (!dto.content && images.length === 0)
      throw new BadRequestException('Post must contain content or images');

    const author = await this.getAuthor(authAccountId, role);

    const post = await this.postModel.create({
      authorId: author._id,
      authorType: role,
      content: dto.content,
      images,
      status: dto.status,
      subscriptionType: dto.subscriptionType,
      usageCount: 0,
    });

    return {
      ...post.toObject(),
      authorName: author.username || author.firstName ||'Unknown',
      authorImage: author.image || null,
    };
  }

  async findAll() {
    const posts = await this.postModel.find().sort({ createdAt: -1 });

    const results: Array<{
      authorName: string;
      authorImage: string | null;
      authorType: UserRole;
      authorId: Types.ObjectId;
      content?: string;
      images?: string[];
      status: string;
      subscriptionType: string;
      createdAt?: Date;
      updatedAt?: Date;
    }> = [];

    for (const post of posts) {
      const authorModel = this.getAuthorModel(post.authorType);
      const author = await authorModel.findById(post.authorId);

      results.push({
        ...post.toObject(),
        authorName: author?.name || 'Unknown',
        authorImage: author?.avatar || null,
      });
    }

    return results;
  }

  async findOne(id: string) {
    const post = await this.postModel.findById(id);
    if (!post) throw new NotFoundException('Post not found');

    const authorModel = this.getAuthorModel(post.authorType);
    const author = await authorModel.findById(post.authorId);

    return {
      ...post.toObject(),
      authorName: author?.name || 'Unknown',
      authorImage: author?.avatar || null,
    };
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
        throw new BadRequestException('Invalid user role');
    }
  }

  async update(
    id: string,
    dto: Partial<CreatePostDto>,
    images: string[],
    authAccountId: string,
    role: UserRole,
  ) {
    const post = await this.postModel.findById(id);
    if (!post) throw new NotFoundException('Post not found');

    const author = await this.getAuthor(authAccountId, role);
    if (post.authorId.toString() !== author._id.toString())
      throw new ForbiddenException('Not allowed to edit this post');

    const newImages = images.length ? images : post.images;
    if (!dto.content && (!newImages || newImages.length === 0))
      throw new BadRequestException('Post must contain content or images');

    post.content = dto.content ?? post.content;
    post.images = newImages;

    await post.save();
    return {
      ...post.toObject(),
      authorName: author.name,
      authorImage: author.avatar || null,
    };
  }

  async remove(id: string, authAccountId: string) {
    const post = await this.postModel.findById(id);
    if (!post) throw new NotFoundException('Post not found');

    const author = await this.getAuthor(authAccountId, post.authorType);
    if (post.authorId.toString() !== author._id.toString())
      throw new ForbiddenException('Not allowed to delete this post');

    await post.deleteOne();
    return { message: 'Post deleted successfully' };
  }
}
