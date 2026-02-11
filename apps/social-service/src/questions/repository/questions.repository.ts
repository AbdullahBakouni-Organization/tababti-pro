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

      { $unwind: { path: '$answers', preserveNullAndEmptyArrays: true } },

      {
        $lookup: {
          from: 'doctors',
          let: { rid: '$answers.responderId', type: '$answers.responderType' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$_id', '$$rid'] },
                    { $eq: ['$$type', 'doctor'] },
                  ],
                },
              },
            },
          ],
          as: 'doctorResponder',
        },
      },

      {
        $lookup: {
          from: 'hospitals',
          let: { rid: '$answers.responderId', type: '$answers.responderType' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$_id', '$$rid'] },
                    { $eq: ['$$type', 'hospital'] },
                  ],
                },
              },
            },
          ],
          as: 'hospitalResponder',
        },
      },

      {
        $lookup: {
          from: 'centers',
          let: { rid: '$answers.responderId', type: '$answers.responderType' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$_id', '$$rid'] },
                    { $eq: ['$$type', 'center'] },
                  ],
                },
              },
            },
          ],
          as: 'centerResponder',
        },
      },

      {
        $addFields: {
          responder: {
            $ifNull: [
              { $arrayElemAt: ['$doctorResponder', 0] },
              {
                $ifNull: [
                  { $arrayElemAt: ['$hospitalResponder', 0] },
                  { $arrayElemAt: ['$centerResponder', 0] },
                ],
              },
            ],
          },
        },
      },

      {
        $lookup: {
          from: 'users',
          localField: 'userId',
          foreignField: '_id',
          as: 'asker',
        },
      },

      {
        $addFields: {
          asker: { $arrayElemAt: ['$asker', 0] },
        },
      },

      {
        $project: {
          content: 1,
          status: 1,
          specializations: 1,
          asker: {
            name: { $ifNull: ['$asker.username', 'Unknown'] },
            image: '$asker.image',
          },

          answer: {
            $cond: [
              { $ifNull: ['$answers._id', false] },
              {
                _id: '$answers._id',
                content: '$answers.content',
                createdAt: '$answers.createdAt',
                responder: '$responder',
              },
              null,
            ],
          },
          createdAt: 1,
          updatedAt: 1,
        },
      },

      {
        $group: {
          _id: '$_id',
          content: { $first: '$content' },
          status: { $first: '$status' },
          specializations: { $first: '$specializations' },
          createdAt: { $first: '$createdAt' },
          updatedAt: { $first: '$updatedAt' },
          asker: { $first: '$asker' },
          answers: {
            $push: '$answer',
          },
        },
      },

      {
        $addFields: {
          answers: {
            $filter: {
              input: '$answers',
              as: 'a',
              cond: { $ne: ['$$a', null] },
            },
          },
        },
      },

      { $sort: { createdAt: -1 } },
    ]);
  }

  async findById(id: string) {
    return this.questionModel.findById(id);
  }
}
