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
  status: QuestionStatus;
  specializations: any[];
  answersCount: number;
  answers: MappedAnswer[];
  createdAt: Date;
  updatedAt: Date;
  asker?: { name: string; image: string | null };
}

export interface QuestionPageResult {
  questions: {
    data: any[]; // أو نوع الـ question عندك
    total: number;
  };
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

// ── Moderation result ─────────────────────────────────────────────────────────

export interface ModerationResult {
  questionId: Types.ObjectId;
  /** New status after the moderation action */
  status: QuestionStatus.APPROVED | QuestionStatus.REJECTED;
  /** Rejection reason (only present when rejected) */
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
