import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, PipelineStage, Types } from 'mongoose';
import { Question } from '@app/common/database/schemas/question.schema';

export interface QuestionPage {
  questions: any[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

@Injectable()
export class QuestionsRepository {
  constructor(
    @InjectModel(Question.name) private readonly questionModel: Model<Question>,
  ) {}

  // ── Create ────────────────────────────────────────────────────────────────

  create(data: Partial<Question>) {
    return this.questionModel.create(data);
  }

  // ── Find with answers & responder lookup ──────────────────────────────────

  /**
   * Aggregates questions with their answers, responders, asker, and
   * specialization details. Returns a paginated result.
   */
  async findQuestionsWithAnswers(
    match: Record<string, any> = {},
    skip = 0,
    limit = 10,
  ): Promise<QuestionPage> {
    const pipeline: PipelineStage[] = [
      { $match: match },
      { $sort: { createdAt: -1 } },

      // ── Specializations ──────────────────────────────────────────────────
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
      {
        $addFields: {
          asker: { $arrayElemAt: ['$askerArr', 0] },
        },
      },
      { $project: { askerArr: 0 } },

      // ── Answers ───────────────────────────────────────────────────────────
      {
        $lookup: {
          from: 'answers',
          localField: '_id',
          foreignField: 'questionId',
          as: 'answers',
        },
      },

      // ── Responders for each answer ────────────────────────────────────────
      // We unwind, look up responder (doctor / hospital / center share the
      // same _id namespace so we try all three and pick whichever matched),
      // then group back.
      { $unwind: { path: '$answers', preserveNullAndEmptyArrays: true } },

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

      // Collapse the three lookup arrays into a single `answers.responder`
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
        },
      },
      {
        $project: {
          'answers.responderDoctor': 0,
          'answers.responderHospital': 0,
          'answers.responderCenter': 0,
        },
      },

      // Re-group answers back onto the question
      {
        $group: {
          _id: '$_id',
          content: { $first: '$content' },
          status: { $first: '$status' },
          userId: { $first: '$userId' },
          specializationId: { $first: '$specializationId' },
          specializations: { $first: '$specializations' },
          asker: { $first: '$asker' },
          answers: { $push: '$answers' },
          createdAt: { $first: '$createdAt' },
          updatedAt: { $first: '$updatedAt' },
        },
      },

      // Clean up empty answer objects created by preserveNullAndEmpty
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

    const page = Math.floor(skip / limit) + 1;

    return {
      questions,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // ── Find by ID ────────────────────────────────────────────────────────────

  async findById(id: string): Promise<Question | null> {
    if (!Types.ObjectId.isValid(id))
      throw new BadRequestException('question.INVALID_ID');
    return this.questionModel.findById(id);
  }
}
