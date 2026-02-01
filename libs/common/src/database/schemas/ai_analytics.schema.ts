import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true, collection: 'ai_analytics' })
export class AIAnalytics extends Document {
  @Prop({ required: true, unique: true })
  date: Date;

  @Prop({ type: Object, required: true })
  stats: {
    totalQuestions: number;
    byComplexity: {
      simple: number;
      medium: number;
      complex: number;
    };
    byCategory: {
      [key: string]: number;
    };
    byProvider: {
      ollama: number;
      gemini: number;
      groq: number;
    };
    cacheHitRate: number;
    avgResponseTime: number;
    errorRate: number;
  };

  @Prop({ type: [String], default: [] })
  topQuestions: string[];

  @Prop({ type: [String], default: [] })
  failedQuestions: string[];

  @Prop({ default: Date.now })
  timestamp: Date;
}

export const AIAnalyticsSchema = SchemaFactory.createForClass(AIAnalytics);

AIAnalyticsSchema.index({ date: -1 });
