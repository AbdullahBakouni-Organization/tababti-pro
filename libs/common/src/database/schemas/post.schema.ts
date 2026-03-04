import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { PostStatus, SubscriptionPlanType, UserRole } from './common.enums';

// Define Enums for better type safety

@Schema({ timestamps: true, collection: 'post' })
export class Post extends Document {
  @Prop({ type: String, enum: UserRole, required: true, index: true })
  authorType: UserRole;

  @Prop({ type: Types.ObjectId, index: true })
  authorId: Types.ObjectId;

  @Prop({ type: String })
  content?: string;

  @Prop([String])
  images?: string[];

  @Prop({
    type: String,
    enum: Object.values(PostStatus),
    default: PostStatus.PUBLISHED,
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
}

export const PostSchema = SchemaFactory.createForClass(Post);

PostSchema.index({ authorId: 1, createdAt: -1 });
PostSchema.index({ subscriptionType: 1, createdAt: -1 });
PostSchema.index({ usageCount: 1 });
PostSchema.index({ authorId: 1, subscriptionType: 1, createdAt: -1 });
PostSchema.index({ authorId: 1, subscriptionType: 1, usageCount: 1 });
