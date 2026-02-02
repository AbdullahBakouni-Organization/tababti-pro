// schemas/admin.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { City } from './common.enums';
@Schema({ timestamps: true, collection: 'cities' })
export class Cities extends Document {
  @Prop({ type: String, required: true, enum: City })
  name: City;

  @Prop({ type: Date })
  createdAt: Date;

  @Prop({ type: Date })
  updatedAt: Date;
}

export const CitySchema = SchemaFactory.createForClass(Cities);

CitySchema.index({ name: 1 }, { unique: true });
