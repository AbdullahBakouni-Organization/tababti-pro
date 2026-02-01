import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { UserRole } from './common.enums';

// Define Enums for better type safety

@Schema({ timestamps: true, collection: 'authAccounts' })
export class AuthAccount extends Document {
  @Prop({ type: [String], index: true, required: true })
  phones: string[];

  @Prop({ type: String, enum: UserRole, required: true, index: true })
  role: UserRole;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ default: new Date() })
  lastLoginAt?: Date;

  @Prop({ default: 0 })
  tokenVersion: number;
}

export const AuthAccountSchema = SchemaFactory.createForClass(AuthAccount);
