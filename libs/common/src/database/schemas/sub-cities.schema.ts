// schemas/admin.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { SubCity } from './common.enums';

@Schema({ timestamps: true, collection: 'subcities' })
export class SubCities extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Cities', index: true })
  cityId: Types.ObjectId;

  @Prop({ type: String, required: true, enum: SubCity })
  name: SubCity;

  @Prop({ type: Date })
  createdAt: Date;

  @Prop({ type: Date })
  updatedAt: Date;
}

export const SubCitiesSchema = SchemaFactory.createForClass(SubCities);

SubCitiesSchema.index({ name: 1 }, { unique: true });
SubCitiesSchema.index({ 'subCities.name': 1 });
