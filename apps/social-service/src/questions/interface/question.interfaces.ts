import { Types } from 'mongoose';
import { QuestionStatus } from '@app/common/database/schemas/common.enums';

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
    questions: MappedQuestion[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}