import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { Document, Types } from 'mongoose';
export interface OtpMethods {
  incrementAttempts(): void;
  isMaxAttemptsReached(): boolean;
  isExpired(): boolean;
}
@Schema({ timestamps: true, collection: 'otp' })
export class Otp extends Document {
  @Prop({ type: Types.ObjectId, ref: 'AuthAccount', unique: true })
  authAccountId: Types.ObjectId;

  @Prop() code: string;

  @Prop() expiresAt: Date;

  @Prop({ default: false })
  isUsed: boolean;

  @Prop({ required: true })
  phone: string;

  @Prop({ max: 3, default: 0 })
  attempts: number;

  @Prop({ default: 3 }) // Maximum allowed attempts
  maxAttempts: number;
}

export const OtpSchema = SchemaFactory.createForClass(Otp);

/**
 * Increment the verification attempts count
 */
OtpSchema.methods.incrementAttempts = function (this: OtpDocument): void {
  this.attempts = (this.attempts ?? 0) + 1;
};

/**
 * Check if maximum attempts have been reached
 */
OtpSchema.methods.isMaxAttemptsReached = function (this: OtpDocument): boolean {
  const max = this.maxAttempts ?? 5;
  return this.attempts >= max;
};

/**
 * Check if OTP is expired
 */
OtpSchema.methods.isExpired = function (this: OtpDocument): boolean {
  return new Date() > this.expiresAt;
};

export type OtpDocument = HydratedDocument<Otp, OtpMethods>;
