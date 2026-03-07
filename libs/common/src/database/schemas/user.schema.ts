import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { ApprovalStatus, City, Gender } from './common.enums';

@Schema({ timestamps: true, collection: 'users', strict: 'throw' })
export class User extends Document {
  @Prop({ type: Types.ObjectId, ref: 'AuthAccount', unique: true })
  authAccountId: Types.ObjectId;

  @Prop({
    required: true,
    trim: true,
    minlength: 3,
    maxlength: 50,
    match: /^[\p{L}._-]+$/u,
  })
  username: string;

  @Prop({ required: true, unique: true, trim: true, match: /^\+9639\d{8}$/ })
  phone: string;

  @Prop({ type: String, enum: Gender, required: true }) // Added Gender Enum
  gender: Gender;

  @Prop()
  profileImage?: string;

  /**
   * MinIO filename (for deletion/management)
   * Example: patients/507f1f77bcf86cd799439011/profile/images/a1b2c3d4-e5f6-7890.jpg
   */
  @Prop()
  profileImageFileName?: string;

  /**
   * MinIO bucket name
   * Example: tababti-patients
   */
  @Prop()
  profileImageBucket?: string;

  @Prop({ type: String, enum: City, required: true }) // Added City Enum
  city: City;

  @Prop({ required: true, type: Date })
  DataofBirth: Date;

  @Prop({
    required: true,
    type: String,
    enum: ApprovalStatus,
  })
  status: ApprovalStatus;

  @Prop({ type: String, maxlength: 4096 })
  fcmToken?: string;
}
export const UserSchema = SchemaFactory.createForClass(User);

export type UserDocument = User & Document;
