// src/schemas/transliteration-cache.schema.ts

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type TransliterationCacheDocument =
  HydratedDocument<TransliterationCache>;

@Schema({ timestamps: true }) // createdAt & updatedAt
export class TransliterationCache {
  @Prop({ type: String, required: true, unique: true })
  text: string;

  @Prop({ type: [String], default: [] })
  variants: string[];

  @Prop({ type: Number, default: 1 })
  hitCount: number;
}

export const TransliterationCacheSchema =
  SchemaFactory.createForClass(TransliterationCache);

// ===== Indexes (match Prisma) =====
TransliterationCacheSchema.index({ hitCount: -1 });
