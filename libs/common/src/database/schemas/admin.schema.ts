// schemas/admin.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { Session, SessionSchema } from './session.schema';

@Schema({ timestamps: true, collection: 'admins' })
export class Admin extends Document {
  @Prop({ type: Types.ObjectId, ref: 'AuthAccount', unique: true })
  authAccountId: Types.ObjectId;

  @Prop({
    required: true,
    trim: true,
    minlength: 3,
    maxlength: 50,
    match: /^[a-zA-Z0-9._-]+$/,
  })
  username: string;

  @Prop({ required: true })
  password: string; // hashed

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ required: true, unique: true })
  phone: string; // Added phone field

  @Prop({ type: [SessionSchema], default: [] })
  sessions: Session[];

  @Prop({ default: 5 }) // Max 5 concurrent sessions
  maxSessions: number;

  // ==================== SECURITY ====================

  @Prop({ default: 0 })
  failedLoginAttempts: number;

  @Prop()
  lockedUntil?: Date;

  @Prop()
  lastLoginAt?: Date;

  @Prop()
  lastLoginIp?: string;
}

export const AdminSchema = SchemaFactory.createForClass(Admin);

export type AdminDocument = Admin & Document;
