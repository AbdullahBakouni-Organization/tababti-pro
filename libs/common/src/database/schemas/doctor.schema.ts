import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { ApprovalStatus, Days, Gender, WorkigEntity } from './common.enums';

@Schema({ timestamps: true, collection: 'doctors' })
export class Doctor extends Document {
  @Prop({ type: Types.ObjectId, ref: 'AuthAccount', unique: true })
  authAccountId: Types.ObjectId;

  @Prop({
    required: true,
    trim: true,
    minlength: 3,
    maxlength: 50,
    match: /^[\p{L}._-]+$/u,
  })
  firstName: string;

  @Prop({
    required: true,
    trim: true,
    minlength: 3,
    maxlength: 50,
    match: /^[\p{L}._-]+$/u,
  })
  lastName: string;

  @Prop({
    required: true,
    trim: true,
    minlength: 3,
    maxlength: 50,
    match: /^[\p{L}._-]+$/u,
  })
  middleName: string;

  @Prop({ type: Number }) latitude?: number;

  @Prop({ type: Number }) longitude?: number;

  @Prop({ type: Types.ObjectId, ref: 'Cities' })
  cityId: Types.ObjectId;

  @Prop({ required: false, type: String }) // Image is optional
  image?: string;

  @Prop({ required: false, type: String }) // Image is optional
  certificateImage?: string;

  @Prop({ required: false, type: String }) // Image is optional
  licenseImages?: string;

  @Prop({
    type: [{ type: Object }],
    index: true,
    required: true,
  })
  phones: {
    whatsup: string[];
    clinic: string[];
    normal: string[];
  }[];

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

  @Prop({ type: [Object] })
  hospitals: {
    name: string;
    id: string;
    location: string;
  }[];

  @Prop({ type: Number })
  inspectionDuration: number;

  @Prop({ type: Number })
  inspectionPrice: number;

  @Prop({ type: [Object] }) centers: {
    name: string;
    id: string;
    location: string;
  }[];

  @Prop({ type: [Object] }) insuranceCompanies: {
    name: string;
    id: string;
    location: string;
  }[];

  @Prop({ type: [{ type: Types.ObjectId, ref: 'PublicSpecialization' }] })
  publicSpecializationId: Types.ObjectId;

  @Prop({ type: [Object] }) workingHours: {
    day: Days;
    location: {
      type: WorkigEntity;
      entity_name: string;
      address: string;
    };
    startTime: string; // format: "09:00"
    endTime: string; // format: "17:00"
  }[];

  @Prop({ type: String, enum: Gender })
  gender: Gender;

  @Prop({ min: 1, max: 5 })
  rating: number;

  @Prop({ type: Types.ObjectId, ref: 'Subscription' })
  subscriptionId: Types.ObjectId;

  @Prop({ default: false })
  isSubscribed: boolean;

  @Prop({
    required: true,
    type: String,
    enum: ApprovalStatus,
  })
  status: ApprovalStatus;

  @Prop({ type: Number })
  searchCount: number;

  @Prop({ type: Number })
  profileViews: number;

  @Prop({ type: String, maxlength: 4096 })
  deviceTokens?: string[];
}
export const DoctorSchema = SchemaFactory.createForClass(Doctor);

DoctorSchema.index({
  cityId: 1,
  gender: 1,
  publicSpecializationId: 1,
  inspectionDuration: 1,
  inspectionPrice: 1,
  rating: -1,
});

DoctorSchema.index({
  publicSpecializationId: 1,
  cityId: 1,
  gender: 1,
  inspectionDuration: 1,
  inspectionPrice: 1,
  rating: 1,
});
DoctorSchema.index({
  publicSpecializationId: 1,
});
DoctorSchema.index({
  publicSpecializationId: 1,
  cityId: 1,
  inspectionPrice: 1,
});
DoctorSchema.index({
  cityId: 1,
  publicSpecializationId: 1,
  inspectionPrice: 1,
});
DoctorSchema.index({
  yearsOfExperience: 1,
});

DoctorSchema.index({
  publicSpecializationId: 1,
  rating: -1,
});
DoctorSchema.index({
  gender: 1,
  rating: 1,
});

DoctorSchema.index({
  firstName: 1,
});
DoctorSchema.index({
  rating: 1,
});
DoctorSchema.index({
  lastName: 1,
});

DoctorSchema.index({
  middleName: 1,
});
DoctorSchema.index({
  latitude: 1,
  longitude: 1,
});
DoctorSchema.index({
  inspectionDuration: 1,
});
DoctorSchema.index({
  inspectionPrice: 1,
});
