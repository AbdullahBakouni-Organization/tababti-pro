import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { PrivateMedicineSpecialty } from './common.enums';

@Schema({ timestamps: true, collection: 'privatespecializations' })
export class PrivateSpecialization extends Document {
  @Prop({
    type: String,
    enum: Object.values(PrivateMedicineSpecialty),
    default: PrivateMedicineSpecialty.AddictionTreatment,
    index: true,
  })
  name: PrivateMedicineSpecialty;
  @Prop({ type: Types.ObjectId, ref: 'PublicSpecialization', index: true })
  publicSpecializationId: Types.ObjectId;
}

export const PrivateSpecializationSchema = SchemaFactory.createForClass(
  PrivateSpecialization,
);
