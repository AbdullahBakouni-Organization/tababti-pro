import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

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
}

export const OtpSchema = SchemaFactory.createForClass(Otp);
