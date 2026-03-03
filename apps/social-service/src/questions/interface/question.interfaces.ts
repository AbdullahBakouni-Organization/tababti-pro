// import { Types } from 'mongoose';
// import { QuestionStatus } from '@app/common/database/schemas/common.enums';

// export interface MappedAnswer {
//     _id: Types.ObjectId;
//     content: string;
//     responderName: string;
//     responderImage: string | null;
//     answeredAgo: string | null;
//     createdAt: Date;
//     isMyAnswer: boolean;
// }

// export interface MappedQuestion {
//     _id: Types.ObjectId;
//     content: string;
//     status: QuestionStatus;
//     specializations: any[];
//     answersCount: number;
//     answers: MappedAnswer[];
//     createdAt: Date;
//     updatedAt: Date;
//     asker?: { name: string; image: string | null };
// }

// export interface QuestionPageResult {
//     questions: MappedQuestion[];
//     total: number;
//     page: number;
//     limit: number;
//     totalPages: number;
// }

// question.interfaces.ts
import { Types } from 'mongoose';

// ═══════════════════════════════════════════════════════════════════════════
// STATISTICS INTERFACES
// ═══════════════════════════════════════════════════════════════════════════

export interface QuestionStatistics {
  total: number;
  answered: number;
  pending: number;
  approved: number;
  rejected: number;
  draft: number;
  withText: number;
  withImages: number;
  withBoth: number;
  answerRate: string;
  approvalRate: string;
}

export interface DoctorStatistics {
  total: number;
  answered: number;
  pending: number;
  myAnswers: number;
  answerRate: string;
  bySpecialization: Record<string, { answered: number; pending: number }>;
}

// ═══════════════════════════════════════════════════════════════════════════
// MEDIA INTERFACES
// ═══════════════════════════════════════════════════════════════════════════

export interface ImageMetadata {
  url: string;
  type: string;
  size?: number;
  uploadedAt?: Date;
}

export interface QuestionWithMedia {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  content: string;
  images: ImageMetadata[];
  mediaType: 'text' | 'images' | 'both';
  imageCount: number;
  status: string;
  approvalStatus: string;
  hasText: boolean;
  hasImages: boolean;
  specializationId: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAPPED RESPONSE INTERFACES
// ═══════════════════════════════════════════════════════════════════════════

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
  images?: string[];
  status: string;
  approvalStatus?: string;
  hasText?: boolean;
  hasImages?: boolean;
  specializations: any[];
  answersCount: number;
  answers: MappedAnswer[];
  createdAt: Date;
  updatedAt: Date;
  asker?: {
    name: string;
    image: string | null;
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// PAGINATION INTERFACES
// ═══════════════════════════════════════════════════════════════════════════

export interface QuestionPageResult {
  questions: MappedQuestion[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// DTO INTERFACES
// ═══════════════════════════════════════════════════════════════════════════

export interface CreateQuestionDto {
  content: string;
  specializationId: string;
  images?: Express.Multer.File[];
}

export interface FilterQuestionDto {
  filter?: 'allQuestions' | 'answered' | 'pending' | 'public';
  publicSpecializationId?: string;
  privateSpecializationIds?: string[];
}

export interface AnswerQuestionDto {
  content: string;
}

export interface ApproveQuestionDto {
  questionId: string;
}

export interface RejectQuestionDto {
  rejectionReason: string;
}
