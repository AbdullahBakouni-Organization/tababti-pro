import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true, collection: 'ai_conversations' })
export class Conversation extends Document {
  @Prop({ required: true, index: true })
  userId: string;

  @Prop({ required: true, index: true })
  sessionId: string;

  @Prop({ required: true })
  question: string;

  @Prop({ required: true })
  answer: string;

  @Prop({
    required: true,
    enum: [
      'general',
      'doctor_search',
      'hospital_info',
      'booking',
      'medical_drug',
      'medical_diagnosis',
      'medical_image',
      'prescription',
      'symptoms',
    ],
  })
  category: string;

  @Prop({ required: true, enum: ['simple', 'medium', 'complex'] })
  complexity: string;

  @Prop({ required: true, enum: ['ar', 'en'] })
  language: string;

  @Prop({ required: true, enum: ['ollama', 'gemini', 'groq', 'huggingface'] })
  aiProvider: string;

  @Prop({ required: true })
  responseTime: number;

  @Prop({ default: false })
  cached: boolean;

  @Prop({ default: false })
  hasImages: boolean;

  @Prop({ type: Object })
  metadata: {
    suggestions?: string[];
    actions?: any[];
    relatedQuestions?: string[];
    cacheLevel?: string;
  };

  @Prop({ default: Date.now, index: true })
  timestamp: Date;

  @Prop({ type: Number, default: null })
  userRating: number; // للتقييم لاحقاً

  @Prop({ type: String, default: null })
  userFeedback: string; // ملاحظات المستخدم
}

export const ConversationSchema = SchemaFactory.createForClass(Conversation);

// Indexes
ConversationSchema.index({ userId: 1, timestamp: -1 });
ConversationSchema.index({ sessionId: 1 });
ConversationSchema.index({ category: 1, timestamp: -1 });
ConversationSchema.index({ timestamp: -1 });
