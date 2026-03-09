import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, PipelineStage, Types } from 'mongoose';
import { Question } from '@app/common/database/schemas/question.schema';
import { QuestionStatus } from '@app/common/database/schemas/common.enums';

export interface QuestionPage {
  questions: any[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface RawStatsByStatus {
  approved: number;
  answered: number;
  pending: number;
  rejected: number;
  deleted: number;
  total: number;
}

export interface RawSpecializationStat {
  specializationId: Types.ObjectId;
  name: string;
  approved: number;
  answered: number;
  pending: number;
  rejected: number;
  total: number;
}

@Injectable()
export class QuestionsRepository {
  constructor(
    @InjectModel(Question.name)
    private readonly questionModel: Model<Question>,
  ) {}

  // ── Create ────────────────────────────────────────────────────────────────
  create(data: Partial<Question>) {
    return this.questionModel.create(data);
  }

  // ── Find by ID ────────────────────────────────────────────────────────────
  async findById(id: string): Promise<Question | null> {
    if (!Types.ObjectId.isValid(id))
      throw new BadRequestException('question.INVALID_ID');
    return this.questionModel.findById(id).lean();
  }

  // ── Delete ────────────────────────────────────────────────────────────────
  async delete(id: string): Promise<Question | null> {
    if (!Types.ObjectId.isValid(id))
      throw new BadRequestException('question.INVALID_ID');
    return this.questionModel.findByIdAndDelete(new Types.ObjectId(id)).lean();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // STATISTICS
  // ══════════════════════════════════════════════════════════════════════════

  async getStatsByStatus(
    match: Record<string, any> = {},
  ): Promise<RawStatsByStatus> {
    const rows: { _id: QuestionStatus; count: number }[] =
      await this.questionModel.aggregate([
        { $match: match },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]);

    const result: RawStatsByStatus = {
      approved: 0,
      answered: 0,
      pending: 0,
      rejected: 0,
      deleted: 0,
      total: 0,
    };

    for (const row of rows) {
      result.total += row.count;
      if (row._id === QuestionStatus.APPROVED) result.approved = row.count;
      if (row._id === QuestionStatus.ANSWERED) result.answered = row.count;
      if (row._id === QuestionStatus.PENDING) result.pending = row.count;
      if (row._id === QuestionStatus.REJECTED) result.rejected = row.count;
      if (row._id === QuestionStatus.DELETED) result.deleted = row.count;
    }
    return result;
  }

  async getStatsBySpecialization(
    match: Record<string, any> = {},
  ): Promise<RawSpecializationStat[]> {
    const pipeline: PipelineStage[] = [
      { $match: match },
      { $unwind: '$specializationId' },
      {
        $group: {
          _id: { specializationId: '$specializationId', status: '$status' },
          count: { $sum: 1 },
        },
      },
      {
        $group: {
          _id: '$_id.specializationId',
          approved: {
            $sum: {
              $cond: [
                { $eq: ['$_id.status', QuestionStatus.APPROVED] },
                '$count',
                0,
              ],
            },
          },
          answered: {
            $sum: {
              $cond: [
                { $eq: ['$_id.status', QuestionStatus.ANSWERED] },
                '$count',
                0,
              ],
            },
          },
          pending: {
            $sum: {
              $cond: [
                { $eq: ['$_id.status', QuestionStatus.PENDING] },
                '$count',
                0,
              ],
            },
          },
          rejected: {
            $sum: {
              $cond: [
                { $eq: ['$_id.status', QuestionStatus.REJECTED] },
                '$count',
                0,
              ],
            },
          },
          total: { $sum: '$count' },
        },
      },
      {
        $lookup: {
          from: 'privatespecializations',
          localField: '_id',
          foreignField: '_id',
          as: 'spec',
        },
      },
      {
        $project: {
          specializationId: '$_id',
          name: { $ifNull: [{ $arrayElemAt: ['$spec.name', 0] }, 'Unknown'] },
          approved: 1,
          answered: 1,
          pending: 1,
          rejected: 1,
          total: 1,
          _id: 0,
        },
      },
      { $sort: { total: -1 } },
    ];

    return this.questionModel.aggregate(pipeline);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // GENERAL FEED
  // ══════════════════════════════════════════════════════════════════════════

  async findQuestionsWithAnswers(
    match: Record<string, any> = {},
    skip = 0,
    limit = 10,
  ): Promise<QuestionPage> {
    return this._aggregate({
      match,
      skip,
      limit,
      doctorId: null,
      showOnlyMine: false,
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // DOCTOR FEED
  // ══════════════════════════════════════════════════════════════════════════

  async findDoctorQuestionsWithAnswers(
    match: Record<string, any> = {},
    skip = 0,
    limit = 10,
    doctorId: Types.ObjectId,
    showOnlyMine: boolean,
  ): Promise<QuestionPage> {
    return this._aggregate({ match, skip, limit, doctorId, showOnlyMine });
  }

  // ── Shared aggregation pipeline ───────────────────────────────────────────
  private async _aggregate(options: {
    match: Record<string, any>;
    skip: number;
    limit: number;
    doctorId: Types.ObjectId | null;
    showOnlyMine: boolean;
  }): Promise<QuestionPage> {
    const { match, skip, limit, doctorId, showOnlyMine } = options;

    const pipeline: PipelineStage[] = [
      { $match: match },
      { $sort: { createdAt: -1 } },

      // ── Specializations ─────────────────────────────────────────────────
      {
        $lookup: {
          from: 'privatespecializations',
          localField: 'specializationId',
          foreignField: '_id',
          as: 'specializations',
        },
      },

      // ── Asker (User) ─────────────────────────────────────────────────────
      {
        $lookup: {
          from: 'users',
          localField: 'userId',
          foreignField: '_id',
          as: 'askerArr',
        },
      },
      { $addFields: { asker: { $arrayElemAt: ['$askerArr', 0] } } },
      { $project: { askerArr: 0 } },

      // ── Answers ──────────────────────────────────────────────────────────
      {
        $lookup: {
          from: 'answers',
          localField: '_id',
          foreignField: 'questionId',
          as: 'allAnswers',
        },
      },
      {
        $addFields: {
          answersCount: { $size: '$allAnswers' },
          answers:
            showOnlyMine && doctorId
              ? {
                  $filter: {
                    input: '$allAnswers',
                    as: 'a',
                    cond: { $eq: ['$$a.responderId', doctorId] },
                  },
                }
              : '$allAnswers',
        },
      },
      { $project: { allAnswers: 0 } },

      { $unwind: { path: '$answers', preserveNullAndEmptyArrays: true } },

      // ── Responder lookups ─────────────────────────────────────────────────
      {
        $lookup: {
          from: 'doctors',
          localField: 'answers.responderId',
          foreignField: '_id',
          as: 'answers.responderDoctor',
        },
      },
      {
        $lookup: {
          from: 'hospitals',
          localField: 'answers.responderId',
          foreignField: '_id',
          as: 'answers.responderHospital',
        },
      },
      {
        $lookup: {
          from: 'centers',
          localField: 'answers.responderId',
          foreignField: '_id',
          as: 'answers.responderCenter',
        },
      },
      {
        $addFields: {
          'answers.responder': {
            $ifNull: [
              { $arrayElemAt: ['$answers.responderDoctor', 0] },
              {
                $ifNull: [
                  { $arrayElemAt: ['$answers.responderHospital', 0] },
                  { $arrayElemAt: ['$answers.responderCenter', 0] },
                ],
              },
            ],
          },
          'answers.isMyAnswer': doctorId
            ? { $eq: ['$answers.responderId', doctorId] }
            : false,
        },
      },
      {
        $project: {
          'answers.responderDoctor': 0,
          'answers.responderHospital': 0,
          'answers.responderCenter': 0,
        },
      },

      // ── Re-group ──────────────────────────────────────────────────────────
      {
        $group: {
          _id: '$_id',
          content: { $first: '$content' },
          images: { $first: '$images' }, // ← added
          hasText: { $first: '$hasText' }, // ← added
          hasImages: { $first: '$hasImages' }, // ← added
          status: { $first: '$status' },
          userId: { $first: '$userId' },
          specializationId: { $first: '$specializationId' },
          specializations: { $first: '$specializations' },
          asker: { $first: '$asker' },
          answers: { $push: '$answers' },
          answersCount: { $first: '$answersCount' },
          createdAt: { $first: '$createdAt' },
          updatedAt: { $first: '$updatedAt' },
        },
      },

      // Remove null answer slots (from preserveNullAndEmptyArrays)
      {
        $addFields: {
          answers: {
            $filter: {
              input: '$answers',
              as: 'a',
              cond: { $ifNull: ['$$a._id', false] },
            },
          },
        },
      },

      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: limit },
    ];

    const [questions, total] = await Promise.all([
      this.questionModel.aggregate(pipeline),
      this.questionModel.countDocuments(match),
    ]);

    const page = skip === 0 ? 1 : Math.floor(skip / limit) + 1;
    return {
      questions,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }
}
