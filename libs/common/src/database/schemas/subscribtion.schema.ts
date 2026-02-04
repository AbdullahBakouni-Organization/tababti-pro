import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, HydratedDocument, Model, Types } from 'mongoose';
import {
  SubscriptionOwnerType,
  SubscriptionPlanType,
  SubscriptionStatus,
} from './common.enums';
export interface SubscriptionMethods {
  isExpired(): boolean;
  canCreatePost(): boolean;
  canCreateOffer(): boolean;
  getRemainingPosts(): number;
  getRemainingOffers(): number;
}
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

  // Limits
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

  // Usage tracking
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

  // Daily ad configuration (for daily subscription & free trial)
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

  // Restrictions
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

  // Payment info (null for free trial)
  @Prop({
    type: {
      amount: { type: Number },
      currency: { type: String, default: 'IQD' },
      paymentMethod: { type: String }, // 'cash', 'online', 'bank_transfer'
      paymentDate: { type: Date },
      transactionId: { type: String },
    },
    _id: false,
  })
  payment?: {
    amount: number;
    currency: string;
    paymentMethod: string;
    paymentDate: Date;
    transactionId: string;
  };

  // Trial-specific fields
  @Prop({ type: Boolean, default: false })
  isTrial: boolean;

  @Prop({ type: Boolean, default: false })
  autoRenew: boolean;

  // Cancellation info
  @Prop({ type: String })
  cancellationReason?: string;

  @Prop({ type: Date })
  cancelledAt?: Date;

  @Prop({ type: Types.ObjectId })
  cancelledBy?: Types.ObjectId;
}

export type SubscriptionDocument = HydratedDocument<
  Subscription,
  SubscriptionMethods
>;

export type SubscriptionModel = Model<
  SubscriptionDocument,
  {},
  SubscriptionMethods
>;

/* ----------------------------------------------------
 * Schema Factory
 * -------------------------------------------------- */
export const SubscriptionSchema = SchemaFactory.createForClass(Subscription);

// ---------------------------------------------------------
// Indexes
// ---------------------------------------------------------

// Unique: One active subscription per owner
SubscriptionSchema.index(
  { ownerId: 1, ownerType: 1 },
  {
    unique: true,
    partialFilterExpression: { status: SubscriptionStatus.ACTIVE },
  },
);

// Status and expiry
SubscriptionSchema.index({ status: 1, endDate: 1 });

// Plan type
SubscriptionSchema.index({ planType: 1 });

// Daily ad scheduling
SubscriptionSchema.index({ 'dailyAd.scheduledDates.date': 1 });

// Trial subscriptions
SubscriptionSchema.index({ isTrial: 1, status: 1 });

// Owner lookup
SubscriptionSchema.index({ ownerType: 1, ownerId: 1, status: 1 });

// ---------------------------------------------------------
// Virtual: Days Remaining
// ---------------------------------------------------------

SubscriptionSchema.virtual('daysRemaining').get(function () {
  if (this.status !== SubscriptionStatus.ACTIVE) {
    return 0;
  }
  const now = new Date();
  const end = new Date(this.endDate);
  const diffTime = end.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays > 0 ? diffDays : 0;
});

/* ----------------------------------------------------
 * Instance Methods
 * -------------------------------------------------- */
SubscriptionSchema.methods.isExpired = function (
  this: SubscriptionDocument,
): boolean {
  return (
    this.status === SubscriptionStatus.EXPIRED || new Date() > this.endDate
  );
};

SubscriptionSchema.methods.canCreatePost = function (
  this: SubscriptionDocument,
): boolean {
  if (this.isExpired()) return false;
  return this.usage.postsUsed < this.limits.posts;
};

SubscriptionSchema.methods.canCreateOffer = function (
  this: SubscriptionDocument,
): boolean {
  if (this.isExpired()) return false;
  return this.usage.offersUsed < this.limits.offers;
};

SubscriptionSchema.methods.getRemainingPosts = function (
  this: SubscriptionDocument,
): number {
  return Math.max(0, this.limits.posts - this.usage.postsUsed);
};

SubscriptionSchema.methods.getRemainingOffers = function (
  this: SubscriptionDocument,
): number {
  return Math.max(0, this.limits.offers - this.usage.offersUsed);
};
