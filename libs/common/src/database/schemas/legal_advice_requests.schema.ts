import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import {
  EntityRequestStatus,
  LegalAdviceCategory,
  UserRole,
} from './common.enums';

// Define Enums for better type safety

@Schema({ timestamps: true, collection: 'legal_advice_requests' })
export class LegalAdviceRequest extends Document {
  @Prop({ type: String, enum: UserRole, required: true, index: true })
  requesterType: UserRole;

  @Prop({ type: Types.ObjectId, index: true })
  requesterId: Types.ObjectId;

  @Prop({
    type: String,
    enum: LegalAdviceCategory,
    required: true,
    index: true,
  })
  legalAdviceType: LegalAdviceCategory;

  @Prop({
    type: String,
    enum: Object.values(EntityRequestStatus),
    default: EntityRequestStatus.PENDING,
    index: true,
  })
  status: EntityRequestStatus;

  @Prop({ type: Date })
  createdAt?: Date;

  @Prop({ type: Date })
  updatedAt?: Date;

  @Prop({ type: Date })
  deletedAt?: Date;
}

export const LegalAdviceRequestSchema =
  SchemaFactory.createForClass(LegalAdviceRequest);

LegalAdviceRequestSchema.index({
  requesterType: 1,
  requesterId: 1,
  legalAdviceType: 1,
  status: 1,
});
