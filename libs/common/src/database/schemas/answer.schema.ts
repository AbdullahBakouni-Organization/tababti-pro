import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { UserRole } from './common.enums';

// Define Enums for better type safety

@Schema({ timestamps: true, collection: 'answers' })
export class Answer extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Question', index: true })
  questionId: Types.ObjectId;
  @Prop({ type: String, enum: UserRole, required: true, index: true })
  responderType: UserRole;

  @Prop({ type: Types.ObjectId })
  responderId: Types.ObjectId;

  @Prop() content: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export const AnswerSchema = SchemaFactory.createForClass(Answer);
