import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import {
  NotificationStatus,
  NotificationTypes,
  UserRole,
} from './common.enums';

// Define Enums for better type safety

@Schema({ timestamps: true, collection: 'notifications' })
export class Notification extends Document {
  @Prop({ type: String, enum: UserRole, required: true, index: true })
  recipientType: UserRole;

  @Prop({ type: Types.ObjectId, index: true })
  recipientId: Types.ObjectId;

  @Prop({
    type: String,
    enum: NotificationTypes,
    required: true,
    index: true,
  })
  Notificationtype: NotificationTypes;

  @Prop({ type: String, required: true })
  title: string;

  @Prop({ type: String, required: true })
  message: string;

  @Prop({
    type: String,
    enum: Object.values(NotificationStatus),
    default: NotificationStatus.PENDING,
    index: true,
  })
  status: NotificationStatus;

  @Prop({ default: false }) isRead: boolean;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);

NotificationSchema.index(
  {
    recipientType: 1,
    recipientId: 1,
    status: 1,
    createdAt: 1,
    Notificationtype: 1,
  },
  {
    unique: true,
  },
);
