import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Question } from '@app/common/database/schemas/question.schema';
import { QuestionStatus } from '@app/common/database/schemas/common.enums';

@Injectable()
export class QuestionsRepository {
  constructor(
    @InjectModel(Question.name)
    private readonly questionModel: Model<Question>,
  ) {}

  create(data: any) {
    return this.questionModel.create(data);
  }

  findAll() {
    return this.questionModel
      .find({ status: QuestionStatus.PENDING })
      .populate('specializationId', 'name')
      .populate('userId', 'name')
      .lean();
  }

  findById(id: string) {
    return this.questionModel
      .findById(id)
      .populate('specializationId')
      .populate('userId');
  }
}
