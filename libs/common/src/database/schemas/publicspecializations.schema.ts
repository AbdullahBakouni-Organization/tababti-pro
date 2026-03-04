import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { GeneralSpecialty } from './common.enums';

@Schema({ timestamps: true, collection: 'publicspecializations' })
export class PublicSpecialization extends Document {
  @Prop({
    type: String,
    enum: GeneralSpecialty,
    required: true,
    unique: true,
  })
  name: GeneralSpecialty;
}
export type PublicSpecializationDocument = PublicSpecialization & Document;

export const PublicSpecializationSchema =
  SchemaFactory.createForClass(PublicSpecialization);
