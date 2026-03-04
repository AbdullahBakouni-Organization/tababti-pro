// import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
// import { Document, Types } from 'mongoose';
// import { QuestionStatus, UserRole } from './common.enums';

// // Define Enums for better type safety

// @Schema({ timestamps: true, collection: 'questions' })
// export class Question extends Document {
//   @Prop({ type: Types.ObjectId, ref: 'User', index: true })
//   userId: Types.ObjectId;

//   @Prop({ type: String, required: true })
//   content: string;

//   @Prop({ type: [{ type: Types.ObjectId, ref: 'PrivateSpecialization' }] })
//   specializationId: Types.ObjectId;

//   @Prop({
//     type: String,
//     enum: Object.values(QuestionStatus),
//     default: QuestionStatus.PENDING,
//     index: true,
//   })
//   status: QuestionStatus;

//   @Prop({ type: String })
//   deletedBy: UserRole.ADMIN;

//   @Prop({ type: Date })
//   createdAt?: Date;

//   @Prop({ type: Date })
//   updatedAt?: Date;
// }

// export const QuestionSchema = SchemaFactory.createForClass(Question);

// QuestionSchema.index({ userId: 1, status: 1 });
// QuestionSchema.index({
//   userId: 1,
//   status: 1,
//   deletedBy: 1,
// });

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { QuestionStatus, UserRole, ApprovalStatus } from './common.enums';

// ═══════════════════════════════════════════════════════════════════════════
// QUESTION SCHEMA (FIXED)
// ═══════════════════════════════════════════════════════════════════════════

@Schema({ timestamps: true, collection: 'questions' })
export class Question extends Document {
  // ── User & Content ──────────────────────────────────────────────────────

  @Prop({ type: Types.ObjectId, ref: 'User', index: true })
  userId: Types.ObjectId;

  @Prop({ type: String, required: true })
  content: string;

  // ── IMAGES FIELD ────────────────────────────────────────────────────────

  @Prop({ type: [String], default: [] })
  images: string[];

  // ── Specialization ──────────────────────────────────────────────────────

  @Prop({ type: Types.ObjectId, ref: 'PrivateSpecialization', index: true })
  specializationId: Types.ObjectId;

  // ── Answer Status ────────────────────────────────────────────────────────

  @Prop({
    type: String,
    enum: Object.values(QuestionStatus),
    default: QuestionStatus.PENDING,
    index: true,
  })
  status: QuestionStatus;

  // ── APPROVAL STATUS (FIXED: No index property here)────────────────────────
  // ✅ FIXED: Removed index: true from @Prop (use schema.index() instead)
  // ✅ FIXED: Made it required (not optional)

  @Prop({
    type: String,
    enum: Object.values(ApprovalStatus),
    default: ApprovalStatus.DRAFT,
    required: true, // ✅ FIXED: Make it required
  })
  approvalStatus: ApprovalStatus;

  // ── MEDIA FLAGS ─────────────────────────────────────────────────────────

  @Prop({ type: Boolean, default: true })
  hasText: boolean;

  @Prop({ type: Boolean, default: false })
  hasImages: boolean;

  // ── ADMIN APPROVAL FIELDS ───────────────────────────────────────────────

  @Prop({ type: Types.ObjectId, ref: 'Admin' })
  approvedBy?: Types.ObjectId;

  @Prop({ type: Date })
  approvedAt?: Date;

  // ── ADMIN REJECTION FIELDS ──────────────────────────────────────────────

  @Prop({ type: String })
  rejectionReason?: string;

  @Prop({ type: Types.ObjectId, ref: 'Admin' })
  rejectedBy?: Types.ObjectId;

  @Prop({ type: Date })
  rejectedAt?: Date;

  // ── Soft Delete ─────────────────────────────────────────────────────────

  @Prop({ type: String, enum: Object.values(UserRole) })
  deletedBy?: UserRole;

  // ── Timestamps ──────────────────────────────────────────────────────────

  @Prop({ type: Date })
  createdAt?: Date;

  @Prop({ type: Date })
  updatedAt?: Date;
}

export const QuestionSchema = SchemaFactory.createForClass(Question);

// ── INDEXES (Only here, not in @Prop) ────────────────────────────────────────

// Find questions by user and status
QuestionSchema.index({ userId: 1, status: 1 });

// Find questions by approval status (admin dashboard)
QuestionSchema.index({ approvalStatus: 1, createdAt: -1 });

// Find approved questions by specialization
QuestionSchema.index({ approvalStatus: 1, specializationId: 1, status: 1 });

// Find questions with specific media type
QuestionSchema.index({ hasImages: 1, hasText: 1 });

// Find questions by multiple filters
QuestionSchema.index({ userId: 1, approvalStatus: 1, status: 1 });

// Existing index
QuestionSchema.index({ userId: 1, status: 1, deletedBy: 1 });

// ═══════════════════════════════════════════════════════════════════════════
// ANSWER SCHEMA
// ═══════════════════════════════════════════════════════════════════════════

import { AnswerStatus } from './common.enums';

@Schema({ timestamps: true, collection: 'answers' })
export class Answer extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Question', index: true })
  questionId: Types.ObjectId;

  @Prop({ type: String, enum: UserRole, required: true, index: true })
  responderType: UserRole;

  @Prop({ type: Types.ObjectId, index: true })
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
AnswerSchema.index({ responderId: 1, createdAt: -1 });
