import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { City, CenterCategory, ApprovalStatus } from './common.enums';

@Schema({ timestamps: true, collection: 'center' })
export class Center extends Document {
  @Prop({ type: Types.ObjectId, ref: 'AuthAccount', unique: true })
  authAccountId: Types.ObjectId;

  @Prop() name: string;

  @Prop() address?: string;

  @Prop() latitude?: number;

  @Prop() longitude?: number;

  @Prop({ type: [String], index: true, required: true })
  phones: string[];

  @Prop() visitDurationMinutes: number;

  @Prop({ type: String, enum: CenterCategory, required: true, index: true })
  category: CenterCategory;

  @Prop({ type: String, enum: City, required: true, index: true })
  city: City;

  @Prop({ required: false }) // Image is optional
  image?: string;

  @Prop({ type: [Object] }) workingHours: {
    day: string;
    from: string;
    to: string;
  }[];
  @Prop({ min: 1, max: 5 })
  rating: number;

  @Prop({
    type: String,
    enum: ApprovalStatus,
    default: ApprovalStatus.PENDING,
    index: true,
  })
  approvalStatus: ApprovalStatus;

  @Prop({ type: String })
  fcmToken?: string;
}

export const CenterSchema = SchemaFactory.createForClass(Center);

CenterSchema.index({
  category: 1,
  city: 1,
});

CenterSchema.index({
  city: 1,
  category: 1,
});

CenterSchema.index({
  city: 1,
  category: 1,
  approvalStatus: 1,
});

CenterSchema.index({
  latitude: 1,
  longitude: 1,
});
