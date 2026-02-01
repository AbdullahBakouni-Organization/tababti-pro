// schemas/admin.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { City, SubCity } from './common.enums';
import { ObjectId } from 'mongodb';

@Schema({ timestamps: true, collection: 'cities' })
export class Cities extends Document {
  @Prop({ type: String, required: true, enum: City })
  name: City;

  @Prop({ type: [Object] }) subcities: {
    _id: ObjectId;
    name: SubCity;
  }[];

  @Prop({ type: Date })
  createdAt: Date;

  @Prop({ type: Date })
  updatedAt: Date;
}

export const CitySchema = SchemaFactory.createForClass(Cities);

CitySchema.index({ name: 1 }, { unique: true });
CitySchema.index({ 'subCities.name': 1 });
