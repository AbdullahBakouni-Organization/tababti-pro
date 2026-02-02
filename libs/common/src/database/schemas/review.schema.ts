import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { UserRole } from './common.enums';

// Define Enums for better type safety

@Schema({ timestamps: true, collection: 'reviews' })
export class Review extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', index: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, index: true, ref: 'Doctor' })
  doctorId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, index: true, ref: 'Rating' })
  ratingId: Types.ObjectId;

  @Prop()
  comment?: string;

  @Prop({ type: String })
  deletedBy: UserRole.ADMIN;

  @Prop({ type: Date })
  createdAt?: Date;

  @Prop({ type: Date })
  updatedAt?: Date;
}

export const ReviewSchema = SchemaFactory.createForClass(Review);

ReviewSchema.index({ userId: 1, doctorId: 1, ratingId: 1 }, { unique: true });
ReviewSchema.index(
  { userId: 1, doctorId: 1, ratingId: 1, deletedBy: 1 },
  { unique: true },
);
