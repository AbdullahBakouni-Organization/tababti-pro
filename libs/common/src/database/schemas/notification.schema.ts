import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { NotificationType, UserRole } from './common.enums';

// Define Enums for better type safety

@Schema({ timestamps: true, collection: 'notifications' })
export class Notification extends Document {
  @Prop({ type: String, enum: UserRole, required: true, index: true })
  recipientType: UserRole;

  @Prop({ type: Types.ObjectId, index: true })
  recipientId: Types.ObjectId;

  @Prop({
    type: String,
    enum: NotificationType,
    required: true,
    index: true,
  })
  Notificationtype: NotificationType;
  @Prop({ type: Object }) payload: Record<string, any>;
  @Prop({ default: false }) isRead: boolean;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);
