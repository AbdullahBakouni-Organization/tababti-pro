import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { QuestionStatus, UserRole } from './common.enums';

// Define Enums for better type safety

@Schema({ timestamps: true, collection: 'questions' })
export class Question extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', index: true })
  userId: Types.ObjectId;

  @Prop({ type: String, required: true })
  content: string;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'PrivateSpecialization' }] })
  specializationId: Types.ObjectId;

  @Prop({
    type: String,
    enum: Object.values(QuestionStatus),
    default: QuestionStatus.PENDING,
    index: true,
  })
  status: QuestionStatus;

  @Prop({ type: String })
  deletedBy: UserRole.ADMIN;

  @Prop({ type: Date })
  createdAt?: Date;

  @Prop({ type: Date })
  updatedAt?: Date;
}

export const QuestionSchema = SchemaFactory.createForClass(Question);

QuestionSchema.index({ userId: 1, status: 1 });
QuestionSchema.index({
  userId: 1,
  status: 1,
  deletedBy: 1,
});
