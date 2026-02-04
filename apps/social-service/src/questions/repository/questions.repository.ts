import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Question } from '../../../../../libs/common/src/database/schemas/question.schema';

@Injectable()
export class QuestionsRepository {
  constructor(
    @InjectModel(Question.name)
    private readonly questionModel: Model<Question>,
  ) {}

  create(data: Partial<Question>) {
    return this.questionModel.create(data);
  }

  findAll() {
    return this.questionModel.find().lean();
  }

  findById(id: string) {
    return this.questionModel.findById(id);
  }
}
