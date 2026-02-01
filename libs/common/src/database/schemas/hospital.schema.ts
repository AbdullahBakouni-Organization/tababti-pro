import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import {
  ApprovalStatus,
  HospitalCategory,
  HospitalStatus,
} from './common.enums';

@Schema({ timestamps: true, collection: 'hospital' })
export class Hospital extends Document {
  @Prop({ type: Types.ObjectId, ref: 'AuthAccount', unique: true })
  authAccountId: Types.ObjectId;

  @Prop({
    type: String,
    required: true,
    trim: true,
    minlength: 3,
    maxlength: 50,
    match: /^[\p{L}._-]+$/u,
  })
  name: string;

  @Prop({
    required: true,
    trim: true,
    minlength: 3,
    maxlength: 50,
    match: /^[\p{L}\p{N}._-]+$/u,
  }) // Address is optional
  address?: string;

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

  @Prop({ type: String, enum: HospitalCategory, required: true })
  category: HospitalCategory;

  @Prop({ type: String, enum: HospitalStatus, required: true })
  hospitalstatus: HospitalStatus;

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

  @Prop({ required: false }) // Image is optional
  image?: string;

  @Prop({ type: Number, required: false })
  numberOfBeds?: number;

  @Prop({ min: 1, max: 5 })
  rating: number;

  @Prop({
    type: String,
    enum: ApprovalStatus,
    default: ApprovalStatus.PENDING,
    index: true,
  })
  status: ApprovalStatus;

  @Prop({ type: [Object] }) doctors: {
    name: string;
    id: string;
    departement: string;
  }[];

  @Prop({ type: [Object] }) insuranceCompanies: {
    name: string;
    id: string;
    location: string;
  }[];

  @Prop({ type: String })
  fcmToken?: string;
}
export const HospitalSchema = SchemaFactory.createForClass(Hospital);

HospitalSchema.index({
  city: 1,
  category: 1,
});
HospitalSchema.index({
  category: 1,
  city: 1,
});
HospitalSchema.index({
  category: 1,
  city: 1,
  status: 1,
});
HospitalSchema.index({
  latitude: 1,
  longitude: 1,
});
HospitalSchema.index({
  city: 1,
  category: 1,
  status: 1,
  numberOfBeds: 1,
});
