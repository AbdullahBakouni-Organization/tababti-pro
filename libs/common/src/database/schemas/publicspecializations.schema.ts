import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { PublicSpecializationEnums } from './common.enums';

@Schema({ timestamps: true, collection: 'publicspecializations' })
export class PublicSpecialization extends Document {
  @Prop({
    type: String,
    enum: PublicSpecializationEnums,
    required: true,
    unique: true,
  })
  name: PublicSpecializationEnums;
}

export const PublicSpecializationSchema =
  SchemaFactory.createForClass(PublicSpecialization);
PublicSpecializationSchema.index({ name: 1 }, { unique: true });
