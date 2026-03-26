import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true, collection: 'unknownquestions' })
export class UnknownQuestion extends Document {
  @Prop({ type: String, required: true })
  name: string;
}

export const UnknownQuestionSchema =
  SchemaFactory.createForClass(UnknownQuestion);
