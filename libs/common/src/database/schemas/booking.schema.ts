import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { BookingStatus, UserRole, WorkigEntity } from './common.enums';

@Schema({
  timestamps: true,
  collection: 'bookings',
})
export class Booking {
  @Prop({ type: Types.ObjectId, required: true, index: true, ref: 'User' })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, index: true, ref: 'Doctor' })
  doctorId: Types.ObjectId;

  @Prop({
    type: String,
    enum: Object.values(BookingStatus),
    default: BookingStatus.PENDING,
    index: true,
  })
  status: BookingStatus;

  // YYYY-MM-DD
  @Prop({ type: Date, required: true, index: true })
  bookingDate: Date;

  // HH:MM
  @Prop({ type: String, required: true })
  bookingTime: string;

  @Prop({ type: String, required: true })
  bookingEndTime: string;

  @Prop({ type: Object, required: true })
  location: {
    type: WorkigEntity;
    entity_name: string;
    address: string;
  };

  @Prop({ type: Object })
  cancellation: {
    cancelledBy:
      | UserRole.ADMIN
      | UserRole.USER
      | UserRole.DOCTOR
      | UserRole.SYSTEM;
    reason: string;
    cancelledAt: Date;
  };

  @Prop({ type: Number, required: true, index: true })
  price: number;

  @Prop({ type: String, required: true, index: true })
  createdBy: UserRole.DOCTOR | UserRole.USER;

  @Prop({ type: Boolean, required: false, index: true, default: false })
  isRated: boolean;

  @Prop({ type: Types.ObjectId, required: false, index: true, ref: 'Rating' })
  ratingId: Types.ObjectId;

  @Prop()
  note?: string;

  @Prop({ type: Date })
  createdAt?: Date;

  @Prop({ type: Date })
  updatedAt?: Date;

  @Prop({ type: Date })
  completedAt?: Date;
}

export const BookingSchema = SchemaFactory.createForClass(Booking);

BookingSchema.index(
  {
    doctorId: 1,
    userId: 1,
    bookingDate: 1,
    bookingTime: 1,
    bookingEndTime: 1,
    status: 1,
    location: 1,
  },
  { unique: true },
);
