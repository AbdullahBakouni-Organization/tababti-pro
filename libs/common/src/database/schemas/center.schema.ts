import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { ApprovalStatus, CenterSpecialization } from './common.enums';

@Schema({ timestamps: true, collection: 'center' })
export class Center extends Document {
  @Prop({ type: Types.ObjectId, ref: 'AuthAccount', unique: true })
  authAccountId: Types.ObjectId;

  @Prop() name: string;

  @Prop() address?: string;

  @Prop({
    required: false,
    type: String,
    trim: true,
    match: /^[\p{L}\p{N}._-]+$/u,
  })
  bio?: string;

  @Prop({ type: Number }) latitude?: number;

  @Prop({ type: Number }) longitude?: number;

  @Prop({ type: Types.ObjectId, ref: 'Cities', required: true })
  cityId: Types.ObjectId;

  @Prop({
    type: [{ type: Object }],
    index: true,
    required: true,
  })
  phones: {
    whatsup: string[];
    clinic: string[];
    normal: string[];
    emergency: string[];
  }[];

  @Prop({
    type: String,
    enum: CenterSpecialization,
    required: true,
    index: true,
  })
  centerSpecialization: CenterSpecialization;

  @Prop({ required: false }) // Image is optional
  image?: string;

  @Prop({ required: false, type: String }) // Image is optional
  certificateImage?: string;

  @Prop({ required: false, type: String }) // Image is optional
  licenseImages?: string;

  @Prop({ min: 1, max: 5 })
  rating: number;

  @Prop({ type: [Object] }) workingHours: {
    day: string;
    from: string;
    to: string;
  }[];

  @Prop({
    type: String,
    enum: ApprovalStatus,
    default: ApprovalStatus.PENDING,
    index: true,
  })
  approvalStatus: ApprovalStatus;

  @Prop({ type: Types.ObjectId, ref: 'Subscription' })
  subscriptionId: Types.ObjectId;

  @Prop({ default: false })
  isSubscribed: boolean;

  @Prop({ type: Number })
  searchCount: number;

  @Prop({ type: Number })
  profileViews: number;

  @Prop({ type: String, maxlength: 4096 })
  deviceTokens?: string[];
}

export const CenterSchema = SchemaFactory.createForClass(Center);

// Main search index (city → specialization)
CenterSchema.index({ cityId: 1, centerSpecialization: 1 });

// Geo-like search (manual, since you're not using 2dsphere)
CenterSchema.index({ latitude: 1, longitude: 1 });
