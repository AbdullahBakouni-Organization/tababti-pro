import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { BookingStatus, UserRole } from './common.enums';

@Schema({
  timestamps: true,
  collection: 'bookings',
})
export class Booking {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  targetId: Types.ObjectId;

  @Prop({
    type: String,
    enum: Object.values(UserRole),
    required: true,
    index: true,
  })
  targetType: UserRole;

  @Prop({
    type: String,
    enum: Object.values(BookingStatus),
    default: BookingStatus.PENDING,
    index: true,
  })
  status: BookingStatus;

  // YYYY-MM-DD
  @Prop({ type: String, required: true, index: true })
  date: string;

  // HH:MM
  @Prop({ type: String, required: true })
  timeSlot: string;

  @Prop()
  note?: string;
}

export const BookingSchema = SchemaFactory.createForClass(Booking);

BookingSchema.index(
  {
    targetId: 1,
    targetType: 1,
    date: 1,
    timeSlot: 1,
  },
  { unique: true },
);
