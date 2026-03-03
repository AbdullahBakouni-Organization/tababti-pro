// import { Injectable, BadRequestException } from '@nestjs/common';
// import { InjectModel } from '@nestjs/mongoose';
// import { Model, PipelineStage, Types } from 'mongoose';
// import { Question } from '@app/common/database/schemas/question.schema';

// export interface QuestionPage {
//   questions: any[];
//   total: number;
//   page: number;
//   limit: number;
//   totalPages: number;
// }

// @Injectable()
// export class QuestionsRepository {
//   constructor(
//     @InjectModel(Question.name)
//     private readonly questionModel: Model<Question>,
//   ) { }

//   // ── Create ────────────────────────────────────────────────────────────────

//   create(data: Partial<Question>) {
//     return this.questionModel.create(data);
//   }

//   // ── Find by ID ────────────────────────────────────────────────────────────

//   async findById(id: string): Promise<Question | null> {
//     if (!Types.ObjectId.isValid(id))
//       throw new BadRequestException('question.INVALID_ID');
//     return this.questionModel.findById(id).lean();
//   }

//   // ── Delete ────────────────────────────────────────────────────────────────

//   async delete(id: string): Promise<Question | null> {
//     if (!Types.ObjectId.isValid(id))
//       throw new BadRequestException('question.INVALID_ID');
//     return this.questionModel.findByIdAndDelete(new Types.ObjectId(id)).lean();
//   }

//   // ══════════════════════════════════════════════════════════════════════════
//   // GENERAL FEED — all answers, no doctor-specific logic
//   // ══════════════════════════════════════════════════════════════════════════

//   async findQuestionsWithAnswers(
//     match: Record<string, any> = {},
//     skip = 0,
//     limit = 10,
//   ): Promise<QuestionPage> {
//     return this._aggregate({ match, skip, limit, doctorId: null, showOnlyMine: false });
//   }

//   // ══════════════════════════════════════════════════════════════════════════
//   // DOCTOR FEED
//   //
//   // doctorId     — the resolved profile _id of the requesting doctor
//   // showOnlyMine — true  → (myAnswers filter) only include THIS doctor's answer
//   //                false → (all/specialization filter) include all answers,
//   //                         but mark which one is the doctor's with isMyAnswer
//   // ══════════════════════════════════════════════════════════════════════════

//   async findDoctorQuestionsWithAnswers(
//     match: Record<string, any> = {},
//     skip = 0,
//     limit = 10,
//     doctorId: Types.ObjectId,
//     showOnlyMine: boolean,
//   ): Promise<QuestionPage> {
//     return this._aggregate({ match, skip, limit, doctorId, showOnlyMine });
//   }

//   // ── Shared aggregation pipeline ───────────────────────────────────────────

//   private async _aggregate(options: {
//     match: Record<string, any>;
//     skip: number;
//     limit: number;
//     doctorId: Types.ObjectId | null;
//     showOnlyMine: boolean;
//   }): Promise<QuestionPage> {
//     const { match, skip, limit, doctorId, showOnlyMine } = options;

//     const pipeline: PipelineStage[] = [
//       { $match: match },
//       { $sort: { createdAt: -1 } },

//       // ── Specializations ──────────────────────────────────────────────────
//       {
//         $lookup: {
//           from: 'privatespecializations',
//           localField: 'specializationId',
//           foreignField: '_id',
//           as: 'specializations',
//         },
//       },

//       // ── Asker (User) ─────────────────────────────────────────────────────
//       {
//         $lookup: {
//           from: 'users',
//           localField: 'userId',
//           foreignField: '_id',
//           as: 'askerArr',
//         },
//       },
//       { $addFields: { asker: { $arrayElemAt: ['$askerArr', 0] } } },
//       { $project: { askerArr: 0 } },

//       // ── Fetch ALL answers for answersCount ────────────────────────────────
//       {
//         $lookup: {
//           from: 'answers',
//           localField: '_id',
//           foreignField: 'questionId',
//           as: 'allAnswers',
//         },
//       },

//       // answersCount = total answers on the question regardless of filter
//       // answers      = filtered based on showOnlyMine flag
//       {
//         $addFields: {
//           answersCount: { $size: '$allAnswers' },
//           answers: showOnlyMine && doctorId
//             ? {
//               // myAnswers: only show the requesting doctor's answer
//               $filter: {
//                 input: '$allAnswers',
//                 as: 'a',
//                 cond: { $eq: ['$$a.responderId', doctorId] },
//               },
//             }
//             : '$allAnswers', // all/specialization: show all answers
//         },
//       },
//       { $project: { allAnswers: 0 } },

//       // ── Unwind to enrich each answer with responder info ──────────────────
//       { $unwind: { path: '$answers', preserveNullAndEmptyArrays: true } },

//       // Look up responder from all possible collections
//       {
//         $lookup: {
//           from: 'doctors',
//           localField: 'answers.responderId',
//           foreignField: '_id',
//           as: 'answers.responderDoctor',
//         },
//       },
//       {
//         $lookup: {
//           from: 'hospitals',
//           localField: 'answers.responderId',
//           foreignField: '_id',
//           as: 'answers.responderHospital',
//         },
//       },
//       {
//         $lookup: {
//           from: 'centers',
//           localField: 'answers.responderId',
//           foreignField: '_id',
//           as: 'answers.responderCenter',
//         },
//       },

//       // Collapse into single answers.responder field
//       {
//         $addFields: {
//           'answers.responder': {
//             $ifNull: [
//               { $arrayElemAt: ['$answers.responderDoctor', 0] },
//               {
//                 $ifNull: [
//                   { $arrayElemAt: ['$answers.responderHospital', 0] },
//                   { $arrayElemAt: ['$answers.responderCenter', 0] },
//                 ],
//               },
//             ],
//           },
//           // Flag so the client knows which answer belongs to the requesting doctor
//           'answers.isMyAnswer': doctorId
//             ? { $eq: ['$answers.responderId', doctorId] }
//             : false,
//         },
//       },
//       {
//         $project: {
//           'answers.responderDoctor': 0,
//           'answers.responderHospital': 0,
//           'answers.responderCenter': 0,
//         },
//       },

//       // ── Re-group answers back onto the question ───────────────────────────
//       {
//         $group: {
//           _id: '$_id',
//           content: { $first: '$content' },
//           status: { $first: '$status' },
//           userId: { $first: '$userId' },
//           specializationId: { $first: '$specializationId' },
//           specializations: { $first: '$specializations' },
//           asker: { $first: '$asker' },
//           answers: { $push: '$answers' },
//           answersCount: { $first: '$answersCount' },
//           createdAt: { $first: '$createdAt' },
//           updatedAt: { $first: '$updatedAt' },
//         },
//       },

//       // Remove empty stubs left by preserveNullAndEmptyArrays
//       {
//         $addFields: {
//           answers: {
//             $filter: {
//               input: '$answers',
//               as: 'a',
//               cond: { $ifNull: ['$$a._id', false] },
//             },
//           },
//         },
//       },

//       { $sort: { createdAt: -1 } },
//       { $skip: skip },
//       { $limit: limit },
//     ];

//     const [questions, total] = await Promise.all([
//       this.questionModel.aggregate(pipeline),
//       this.questionModel.countDocuments(match),
//     ]);

//     const page = skip === 0 ? 1 : Math.floor(skip / limit) + 1;

//     return {
//       questions,
//       total,
//       page,
//       limit,
//       totalPages: Math.ceil(total / limit),
//     };
//   }
// }

import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, PipelineStage, Types } from 'mongoose';
import { Question } from '@app/common/database/schemas/question.schema';
import { ApprovalStatus } from '@app/common/database/schemas/common.enums';

// ═══════════════════════════════════════════════════════════════════════════
// INTERFACES
// ═══════════════════════════════════════════════════════════════════════════

export interface QuestionPage {
  questions: any[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

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
// REPOSITORY
// ═══════════════════════════════════════════════════════════════════════════

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
  // GENERAL FEED — all answers, no doctor-specific logic
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

  // ══════════════════════════════════════════════════════════════════════════
  // NEW: STATISTICS
  // ══════════════════════════════════════════════════════════════════════════

  async getQuestionStatistics(): Promise<QuestionStatistics> {
    const [
      total,
      answered,
      pending,
      approved,
      rejected,
      draft,
      withText,
      withImages,
      withBoth,
    ] = await Promise.all([
      this.questionModel.countDocuments(),
      this.questionModel.countDocuments({ status: 'ANSWERED' }),
      this.questionModel.countDocuments({ status: 'PENDING' }),
      this.questionModel.countDocuments({ approvalStatus: 'APPROVED' }),
      this.questionModel.countDocuments({ approvalStatus: 'REJECTED' }),
      this.questionModel.countDocuments({ approvalStatus: 'DRAFT' }),
      this.questionModel.countDocuments({ hasText: true }),
      this.questionModel.countDocuments({ hasImages: true }),
      this.questionModel.countDocuments({
        hasText: true,
        hasImages: true,
      }),
    ]);

    const answerRate =
      total > 0 ? `${Math.round((answered / total) * 100)}%` : '0%';
    const approvalRate =
      total > 0 ? `${Math.round((approved / total) * 100)}%` : '0%';

    return {
      total,
      answered,
      pending,
      approved,
      rejected,
      draft,
      withText,
      withImages,
      withBoth,
      answerRate,
      approvalRate,
    };
  }

  async getDoctorStatistics(
    doctorId: Types.ObjectId,
    doctorSpecialization?: Types.ObjectId,
  ): Promise<DoctorStatistics> {
    const match: Record<string, any> = {};

    if (doctorSpecialization) {
      match.specializationId = doctorSpecialization;
    }

    const [total, answered, pending] = await Promise.all([
      this.questionModel.countDocuments(match),
      this.questionModel.countDocuments({
        ...match,
        status: 'ANSWERED',
      }),
      this.questionModel.countDocuments({
        ...match,
        status: 'PENDING',
      }),
    ]);

    // Get doctor's answers
    const answerModel = this.questionModel.collection.db.collection('answers');
    const myAnswersResult = await answerModel
      .aggregate([
        { $match: { responderId: doctorId } },
        {
          $lookup: {
            from: 'questions',
            localField: 'questionId',
            foreignField: '_id',
            as: 'question',
          },
        },
        { $unwind: '$question' },
        { $group: { _id: null, count: { $sum: 1 } } },
      ])
      .toArray();

    const myAnswers = myAnswersResult[0]?.count || 0;
    const answerRate =
      total > 0 ? `${Math.round((myAnswers / total) * 100)}%` : '0%';

    return {
      total,
      answered,
      pending,
      myAnswers,
      answerRate,
      bySpecialization: {},
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // NEW: APPROVAL WORKFLOW
  // ══════════════════════════════════════════════════════════════════════════

  async approveQuestion(
    id: string,
    adminId: Types.ObjectId,
  ): Promise<Question | null> {
    if (!Types.ObjectId.isValid(id))
      throw new BadRequestException('question.INVALID_ID');

    return this.questionModel
      .findByIdAndUpdate(
        new Types.ObjectId(id),
        {
          approvalStatus: ApprovalStatus.APPROVED,
          approvedBy: adminId,
          approvedAt: new Date(),
        },
        { new: true },
      )
      .lean();
  }

  async rejectQuestion(
    id: string,
    adminId: Types.ObjectId,
    reason: string,
  ): Promise<Question | null> {
    if (!Types.ObjectId.isValid(id))
      throw new BadRequestException('question.INVALID_ID');

    return this.questionModel
      .findByIdAndUpdate(
        new Types.ObjectId(id),
        {
          approvalStatus: ApprovalStatus.REJECTED,
          rejectedBy: adminId,
          rejectedAt: new Date(),
          rejectionReason: reason,
        },
        { new: true },
      )
      .lean();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // NEW: FILTERING
  // ══════════════════════════════════════════════════════════════════════════

  async findByMediaType(
    mediaType: 'text' | 'images' | 'both',
    skip = 0,
    limit = 10,
  ): Promise<QuestionPage> {
    const match: Record<string, any> = {
      approvalStatus: ApprovalStatus.APPROVED,
    };

    if (mediaType === 'text') {
      match.hasImages = false;
    } else if (mediaType === 'images') {
      match.hasText = false;
    } else if (mediaType === 'both') {
      match.hasText = true;
      match.hasImages = true;
    }

    return this._aggregate({
      match,
      skip,
      limit,
      doctorId: null,
      showOnlyMine: false,
    });
  }

  async findByApprovalStatus(
    status: ApprovalStatus,
    skip = 0,
    limit = 10,
  ): Promise<QuestionPage> {
    return this._aggregate({
      match: { approvalStatus: status },
      skip,
      limit,
      doctorId: null,
      showOnlyMine: false,
    });
  }

  async findByStatusAndApproval(
    answerStatus: string,
    approvalStatus: ApprovalStatus,
    skip = 0,
    limit = 10,
  ): Promise<QuestionPage> {
    return this._aggregate({
      match: { status: answerStatus, approvalStatus },
      skip,
      limit,
      doctorId: null,
      showOnlyMine: false,
    });
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
      { $match: { ...match, approvalStatus: ApprovalStatus.APPROVED } },
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
      { $addFields: { asker: { $arrayElemAt: ['$askerArr', 0] } } },
      { $project: { askerArr: 0 } },

      // ── Fetch ALL answers ────────────────────────────────────────────────
      {
        $lookup: {
          from: 'answers',
          localField: '_id',
          foreignField: 'questionId',
          as: 'allAnswers',
        },
      },

      // answersCount = total answers on the question
      // answers = filtered based on showOnlyMine flag
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

      // ── Unwind to enrich each answer with responder info ──────────────────
      { $unwind: { path: '$answers', preserveNullAndEmptyArrays: true } },

      // Look up responder
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

      // Collapse into single responder
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

      // ── Re-group answers ────────────────────────────────────────────────
      {
        $group: {
          _id: '$_id',
          content: { $first: '$content' },
          images: { $first: '$images' },
          status: { $first: '$status' },
          approvalStatus: { $first: '$approvalStatus' },
          userId: { $first: '$userId' },
          specializationId: { $first: '$specializationId' },
          specializations: { $first: '$specializations' },
          asker: { $first: '$asker' },
          answers: { $push: '$answers' },
          answersCount: { $first: '$answersCount' },
          hasText: { $first: '$hasText' },
          hasImages: { $first: '$hasImages' },
          createdAt: { $first: '$createdAt' },
          updatedAt: { $first: '$updatedAt' },
        },
      },

      // Remove empty stubs
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
      this.questionModel.countDocuments({
        ...match,
        approvalStatus: ApprovalStatus.APPROVED,
      }),
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
