import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true, collection: 'privatespecializations' })
export class PrivateSpecialization extends Document {
  @Prop() name: string;
  @Prop({ type: Types.ObjectId, ref: 'PublicSpecialization', index: true })
  publicSpecializationId: Types.ObjectId;
}

export const PrivateSpecializationSchema = SchemaFactory.createForClass(
  PrivateSpecialization,
);
PrivateSpecializationSchema.index({ name: 1 }, { unique: true });
