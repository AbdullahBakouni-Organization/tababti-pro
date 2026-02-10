import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Question } from '@app/common/database/schemas/question.schema';

@Injectable()
export class QuestionsRepository {
  constructor(
    @InjectModel(Question.name)
    private readonly questionModel: Model<Question>,
  ) {}

  create(data: any) {
    return this.questionModel.create(data);
  }

  async findQuestionsWithAnswers(match: any = {}) {
    return this.questionModel.aggregate([
      { $match: match },

      {
        $lookup: {
          from: 'privatespecializations',
          localField: 'specializationId',
          foreignField: '_id',
          as: 'specializations',
        },
      },

      {
        $lookup: {
          from: 'answers',
          localField: '_id',
          foreignField: 'questionId',
          as: 'answers',
        },
      },

      {
        $lookup: {
          from: 'users',
          localField: 'answers.responderId',
          foreignField: '_id',
          as: 'responders',
        },
      },

      {
        $project: {
          content: 1,
          status: 1,
          specializations: 1,
          answers: {
            $map: {
              input: { $ifNull: ['$answers', []] },
              as: 'a',
              in: {
                _id: '$$a._id',
                content: '$$a.content',
                createdAt: '$$a.createdAt',
                responder: {
                  $arrayElemAt: [
                    {
                      $filter: {
                        input: '$responders',
                        as: 'r',
                        cond: { $eq: ['$$r._id', '$$a.responderId'] },
                      },
                    },
                    0,
                  ],
                },
              },
            },
          },
          createdAt: 1,
          updatedAt: 1,
        },
      },

      { $sort: { createdAt: -1 } },
    ]);
  }
  async findById(id: string) {
    return this.questionModel.findById(id);
  }
}
