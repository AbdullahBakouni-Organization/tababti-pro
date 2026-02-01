import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { ContentCategory, UserRole } from './common.enums';

// Define Enums for better type safety

@Schema({ timestamps: true, collection: 'content' })
export class Content extends Document {
  @Prop({ type: String, enum: UserRole, required: true, index: true })
  ownerType: UserRole;

  @Prop({ type: Types.ObjectId, index: true })
  ownerId: Types.ObjectId;

  @Prop({ type: String, enum: ContentCategory, required: true, index: true })
  type: ContentCategory;

  @Prop()
  text?: string;
  @Prop([String])
  images?: string[];
  @Prop()
  videoUrl?: string; // Ads only
  @Prop()
  expiresAt?: Date; // Stories / Ads
}

export const ContentSchema = SchemaFactory.createForClass(Content);
