import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, PipelineStage, Types } from 'mongoose';
import { Question } from '@app/common/database/schemas/question.schema';

@Injectable()
export class QuestionsRepository {
  constructor(
    @InjectModel(Question.name)
    private readonly questionModel: Model<Question>,
  ) { }

  create(data: any) {
    return this.questionModel.create(data);
  }

  /**
   * Get questions with answers and responders, with pagination
   * @param match MongoDB filter object
   * @param skip Number of docs to skip
   * @param limit Number of docs to return
   */
  async findQuestionsWithAnswers(
    match: any = {},
    skip = 0,
    limit = 10,
  ): Promise<{
    questions: any[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const pipeline: PipelineStage[] = [
      { $match: match },

      {
        $lookup: {
          from: 'privatespecializations',
          localField: 'specializationId',
          foreignField: '_id',
          as: 'specializations'
        }
      },

      {
        $lookup: {
          from: 'answers',
          localField: '_id',
          foreignField: 'questionId',
          as: 'answers'
        }
      },

      {
        $lookup: {
          from: 'users',
          localField: 'userId',
          foreignField: '_id',
          as: 'asker'
        }
      },

      { $addFields: { asker: { $arrayElemAt: ['$asker', 0] } } },

      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: limit }
    ];

    const questions = await this.questionModel.aggregate(pipeline as any);
    const total = await this.questionModel.countDocuments(match);

    return {
      questions,
      total,
      page: Math.floor(skip / limit) + 1,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findById(id: string) {
    if (!Types.ObjectId.isValid(id)) return null;
    return this.questionModel.findById(id);
  }
}