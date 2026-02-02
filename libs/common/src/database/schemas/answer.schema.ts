import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { AnswerStatus, UserRole } from './common.enums';

// Define Enums for better type safety

@Schema({ timestamps: true, collection: 'answers' })
export class Answer extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Question', index: true })
  questionId: Types.ObjectId;

  @Prop({ type: String, enum: UserRole, required: true, index: true })
  responderType: UserRole;

  @Prop({ type: Types.ObjectId })
  responderId: Types.ObjectId;

  @Prop({ type: String, required: true })
  content: string;

  @Prop({
    type: String,
    enum: Object.values(AnswerStatus),
    default: AnswerStatus.PENDING,
    index: true,
  })
  status: AnswerStatus;

  @Prop({ type: Date })
  createdAt?: Date;

  @Prop({ type: Date })
  updatedAt?: Date;

  @Prop({ type: Date })
  deletedAt?: Date;
}

export const AnswerSchema = SchemaFactory.createForClass(Answer);

AnswerSchema.index({ questionId: 1, responderType: 1, responderId: 1 });
