import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

// Define Enums for better type safety

@Schema({ timestamps: true, collection: 'sessions' })
export class Session extends Document {
  @Prop({ required: true })
  sessionId: string; // UUID for this specific session

  @Prop({ required: true })
  deviceId: string; // Unique device identifier

  @Prop({ required: true })
  deviceName: string; // e.g., "iPhone 13 Pro", "Chrome on Windows"

  @Prop({ required: true })
  deviceType: string; // 'mobile', 'tablet', 'desktop'

  @Prop({ required: true })
  platform: string; // 'ios', 'android', 'web'

  @Prop({ required: true })
  ipAddress: string;

  @Prop()
  userAgent: string;

  @Prop({ required: true })
  refreshToken: string; // Hashed refresh token for this session

  @Prop({ required: true, default: Date.now })
  createdAt: Date;

  @Prop({ required: true, default: Date.now })
  lastActivityAt: Date;

  @Prop({ default: true })
  isActive: boolean;
}

export const SessionSchema = SchemaFactory.createForClass(Session);
