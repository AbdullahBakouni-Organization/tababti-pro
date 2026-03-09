import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { PostStatus, SubscriptionPlanType, UserRole } from './common.enums';

// Define Enums for better type safety
interface PostImageMetadata {
  url: string;
  fileName: string;
  bucket: string;
  uploadedAt: Date;
}
@Schema({ timestamps: true, collection: 'post' })
export class Post extends Document {
  @Prop({ type: String, enum: UserRole, required: true, index: true })
  authorType: UserRole;

  @Prop({ type: Types.ObjectId, index: true })
  authorId: Types.ObjectId;

  @Prop({ type: String })
  content?: string;

  @Prop({ type: [String], default: [] })
  images: string[];

  /**
   * Images metadata (for MinIO management)
   * Used for deletion and file management
   */
  @Prop({
    type: [
      {
        url: { type: String, required: true },
        fileName: { type: String, required: true },
        bucket: { type: String, required: true },
        uploadedAt: { type: Date, default: Date.now },
      },
    ],
    default: [],
  })
  imagesMetadata?: PostImageMetadata[];

  @Prop({
    type: String,
    enum: Object.values(PostStatus),
    default: PostStatus.PENDING,
    index: true,
  })
  status: PostStatus;

  @Prop({
    type: String,
    enum: Object.values(SubscriptionPlanType),
    default: SubscriptionPlanType.YEARLY_TIER_1,
    index: true,
  })
  subscriptionType: SubscriptionPlanType;

  @Prop({ type: Number, default: 0 })
  usageCount: number;

  @Prop({ type: Date })
  createdAt?: Date;

  @Prop({ type: Date })
  updatedAt?: Date;

  @Prop({ type: Number, default: 0 })
  likesCount: number;

  @Prop({ type: [Types.ObjectId], default: [] })
  likedBy: Types.ObjectId[];

  @Prop({ type: Date })
  approvedAt?: Date;

  @Prop({ type: String })
  approvedBy?: string; // Admin ID

  /**
   * Rejection information
   */
  @Prop({ type: Date })
  rejectedAt?: Date;

  @Prop({ type: String })
  rejectedBy?: string; // Admin ID

  @Prop({ type: String })
  rejectionReason?: string; // Why rejected
}

export const PostSchema = SchemaFactory.createForClass(Post);

PostSchema.index({ authorId: 1, createdAt: -1 });
PostSchema.index({ subscriptionType: 1, createdAt: -1 });
PostSchema.index({ usageCount: 1 });
PostSchema.index({ authorId: 1, subscriptionType: 1, createdAt: -1 });
PostSchema.index({ authorId: 1, subscriptionType: 1, usageCount: 1 });

export type PostDocument = Post & Document;
