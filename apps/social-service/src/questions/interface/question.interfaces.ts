import { Types } from 'mongoose';
import { QuestionStatus } from '@app/common/database/schemas/common.enums';

// ── Answer / Question shapes ──────────────────────────────────────────────────

export interface MappedAnswer {
  _id: Types.ObjectId;
  content: string;
  responderName: string;
  responderImage: string | null;
  answeredAgo: string | null;
  createdAt: Date;
  isMyAnswer: boolean;
}

export interface MappedQuestion {
  _id: Types.ObjectId;
  content: string;
  images: string[]; // ← added
  hasText: boolean; // ← added
  hasImages: boolean; // ← added
  status: QuestionStatus;
  specializations: any[];
  answersCount: number;
  answers: MappedAnswer[];
  createdAt: Date;
  updatedAt: Date;
  asker?: { name: string; image: string | null };
}

export interface QuestionPageResult {
  questions: MappedQuestion[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ── Moderation result ─────────────────────────────────────────────────────────

export interface ModerationResult {
  questionId: Types.ObjectId;
  status: QuestionStatus.APPROVED | QuestionStatus.REJECTED;
  reason?: string;
  moderatedAt: Date;
}

// ── Statistics ────────────────────────────────────────────────────────────────

export interface SpecializationStat {
  specializationId: Types.ObjectId;
  name: string;
  total: number;
  approved: number;
  answered: number;
  pending: number;
  rejected: number;
  answeredPercent: number;
  pendingPercent: number;
  approvedPercent: number;
  rejectedPercent: number;
}

export interface QuestionStats {
  total: number;
  approved: number;
  answered: number;
  pending: number;
  rejected: number;
  deleted: number;
  acceptedByMe: number;
  approvedPercent: number;
  answeredPercent: number;
  pendingPercent: number;
  rejectedPercent: number;
  acceptedByMePercent: number;
  bySpecialization: SpecializationStat[];
}
