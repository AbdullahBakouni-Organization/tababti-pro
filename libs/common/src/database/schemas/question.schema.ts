import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

// Define Enums for better type safety

@Schema({ timestamps: true, collection: 'questions' })
export class Question extends Document {
  static findByIdAndDelete(questionId: Types.ObjectId) {
      throw new Error('Method not implemented.');
  }
  @Prop({ type: Types.ObjectId, ref: 'User', index: true })
  userId: Types.ObjectId;

  @Prop() body: string;
}

export const QuestionSchema = SchemaFactory.createForClass(Question);
