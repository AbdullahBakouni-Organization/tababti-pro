import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { UserRole } from './common.enums';

// Define Enums for better type safety

@Schema({ timestamps: true, collection: 'reviews' })
export class Review extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', index: true })
  userId: Types.ObjectId;

  @Prop({ type: String, enum: UserRole, required: true, index: true })
  targetType: UserRole;

  @Prop({ type: Types.ObjectId, index: true })
  targetId: Types.ObjectId;

  @Prop({ min: 1, max: 5 })
  rating: number;
  @Prop()
  comment?: string;
}

export const ReviewSchema = SchemaFactory.createForClass(Review);
