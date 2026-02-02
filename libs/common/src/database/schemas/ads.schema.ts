import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { AdStatus, UserRole } from './common.enums';

@Schema({
  timestamps: true,
  collection: 'ads',
})
export class Ads {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  createdById: Types.ObjectId;

  @Prop({ required: true, type: String })
  adImage: string;

  @Prop({ type: Date })
  scheduledDate?: Date;

  @Prop({ type: Date })
  expiryDate?: Date;

  @Prop({ type: Date })
  updatedAt?: Date;

  @Prop({ type: Date })
  createdAt?: Date;

  @Prop({
    type: String,
    enum: Object.values(AdStatus),
    default: AdStatus.ACTIVE,
    index: true,
  })
  status: AdStatus;

  @Prop({ type: String })
  deletedBy: UserRole.ADMIN;
}
export const AdsSchema = SchemaFactory.createForClass(Ads);

AdsSchema.index(
  {
    createdById: 1,
    adImage: 1,
    status: 1,
    createdAt: 1,
  },
  { unique: true },
);
