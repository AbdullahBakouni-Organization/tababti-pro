import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';

@Schema({
  timestamps: true,
  collection: 'rating',
})
export class Rating {
  @Prop({ type: Types.ObjectId, required: true, index: true, ref: 'User' })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, index: true, ref: 'Doctor' })
  doctorId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, index: true, ref: 'Booking' })
  bookingId: Types.ObjectId;

  @Prop({ type: Number, required: true })
  rating: number;

  @Prop({ type: Boolean, default: false })
  isVerified: boolean;

  @Prop({ type: Boolean, default: true })
  isVisible: boolean;

  @Prop({ type: Date })
  createdAt?: Date;

  @Prop({ type: Date })
  updatedAt?: Date;
}

export const RatingSchema = SchemaFactory.createForClass(Rating);

RatingSchema.index(
  {
    doctorId: 1,
    userId: 1,
    isVerified: 1,
    isVisible: 1,
  },
  { unique: true },
);
