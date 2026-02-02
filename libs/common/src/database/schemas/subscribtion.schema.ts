import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import {
  SubscriptionOwnerType,
  SubscriptionPlanType,
  SubscriptionStatus,
} from './common.enums';

@Schema({ timestamps: true, collection: 'subscriptions' })
export class Subscription extends Document {
  @Prop({ required: true, enum: SubscriptionOwnerType, type: String })
  ownerType: SubscriptionOwnerType;

  @Prop({ type: Types.ObjectId, required: true })
  ownerId: Types.ObjectId;

  @Prop({ required: true, enum: SubscriptionPlanType, type: String })
  planType: SubscriptionPlanType;

  @Prop({
    required: true,
    enum: SubscriptionStatus,
    type: String,
    default: SubscriptionStatus.ACTIVE,
  })
  status: SubscriptionStatus;

  @Prop({ required: true })
  startDate: Date;

  @Prop({ required: true })
  endDate: Date;

  @Prop({
    type: {
      posts: { type: Number, default: 0 },
      offers: { type: Number, default: 0 },

      bookingsEnabled: { type: Boolean, default: false },
      showProfilePublic: { type: Boolean, default: false },
    },
    _id: false,
  })
  limits: {
    posts: number;
    offers: number;
    bookingsEnabled: boolean;
    showProfilePublic: boolean;
  };

  @Prop({
    type: {
      postsUsed: { type: Number, default: 0 },
      offersUsed: { type: Number, default: 0 },
    },
    _id: false,
  })
  usage: {
    postsUsed: number;
    offersUsed: number;
  };

  @Prop({
    type: {
      enabled: { type: Boolean, default: false },
      maxPerDay: { type: Number, default: 1 },

      scheduledDates: [
        {
          date: { type: Date, required: true },
          adId: { type: Types.ObjectId, required: true },
        },
      ],
    },
    _id: false,
  })
  dailyAd?: {
    enabled: boolean;
    maxPerDay: number;
    scheduledDates: {
      date: Date;
      adId: Types.ObjectId;
    }[];
  };

  @Prop({
    type: {
      allowOffers: { type: Boolean, default: true },
      allowBookings: { type: Boolean, default: false },
    },
    _id: false,
  })
  restrictions: {
    allowOffers: boolean;
    allowBookings: boolean;
  };
}

export const SubscriptionSchema = SchemaFactory.createForClass(Subscription);

SubscriptionSchema.index({ ownerId: 1, ownerType: 1 }, { unique: true });
SubscriptionSchema.index({ status: 1, endDate: 1 });
SubscriptionSchema.index({ planType: 1 });
SubscriptionSchema.index({ 'dailyAd.scheduledDates.date': 1 });
