import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { OfferStatus, OfferType, UserRole } from './common.enums';

@Schema({
  timestamps: true,
  collection: 'offers',
})
export class Offer {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  createdById: Types.ObjectId;

  @Prop({
    type: String,
    enum: Object.values(UserRole),
    default: UserRole.DOCTOR,
    index: true,
  })
  authorType: UserRole.DOCTOR | UserRole.CENTER;

  @Prop({ required: true, type: String })
  title: string;

  @Prop({ required: true, type: String })
  description: string;

  @Prop({ type: Date })
  startDate?: Date;

  @Prop({ type: Date })
  endDate?: Date;

  @Prop({ type: Date })
  expiryDate?: Date;

  @Prop({ type: Date })
  updatedAt?: Date;

  @Prop({ type: Date })
  createdAt?: Date;

  @Prop({
    type: String,
    enum: Object.values(OfferStatus),
    default: OfferStatus.ACTIVE,
    index: true,
  })
  status: OfferStatus;

  @Prop({
    type: String,
    enum: Object.values(OfferType),
    default: OfferType.DiscountedPackage,
    index: true,
  })
  type: OfferType;

  @Prop({ type: String })
  deletedBy: UserRole.ADMIN;
}
export const OffersSchema = SchemaFactory.createForClass(Offer);

OffersSchema.index(
  {
    createdById: 1,
    type: 1,
    status: 1,
    createdAt: 1,
  },
  { unique: true },
);
