// schemas/admin.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { Session, SessionSchema } from './session.schema';
import { HydratedDocument } from 'mongoose';
export interface AdminMethods {
  incrementFailedAttempts?: () => void;
  resetFailedAttempts?: () => void;
  getActiveSessionsCount?: () => number;
}
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

  // See doctor.schema.ts — `select: false` keeps refresh-token hashes out of
  // every `findOne()` that does not explicitly opt in.
  @Prop({ type: [SessionSchema], default: [], select: false })
  sessions: Session[];

  @Prop({ default: 5, select: false }) // Max 5 concurrent sessions
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

AdminSchema.methods.getActiveSessionsCount = function (this: Admin): number {
  // `sessions` is `select: false` — guard so callers that forgot to opt it
  // back in get 0 instead of a TypeError on undefined.
  return (this.sessions ?? []).filter((s) => s.isActive).length;
};

AdminSchema.methods.incrementFailedAttempts = function (this: Admin) {
  this.failedLoginAttempts += 1;

  if (this.failedLoginAttempts >= 2) {
    this.lockedUntil = new Date(Date.now() + 30 * 60 * 1000); // Lock for 30 minutes
  }
};

AdminSchema.methods.resetFailedAttempts = function (this: Admin) {
  this.failedLoginAttempts = 0;
  this.lockedUntil = undefined;
};

export type AdminDocument = HydratedDocument<Admin> & AdminMethods;
