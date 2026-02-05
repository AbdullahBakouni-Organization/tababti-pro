import { Injectable, NotFoundException } from '@nestjs/common';
import { Types, Model } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';
import { QuestionsRepository } from '../repository/questions.repository';
import { CreateQuestionDto } from '../dto/create-question.dto';
import { QuestionStatus } from '@app/common/database/schemas/common.enums';
import { PrivateSpecialization } from '@app/common/database/schemas/privatespecializations.schema';

@Injectable()
export class QuestionsService {
  constructor(
    private readonly repo: QuestionsRepository,
    @InjectModel(PrivateSpecialization.name)
    private readonly specializationModel: Model<PrivateSpecialization>,
  ) {}

  async create(dto: CreateQuestionDto, userId: string) {
    const specializationObjectIds = dto.specializationId.map(
      (id) => new Types.ObjectId(id),
    );

    const count = await this.specializationModel.countDocuments({
      _id: { $in: specializationObjectIds },
    });

    if (count !== specializationObjectIds.length) {
      throw new NotFoundException('specialization.NOT_FOUND');
    }

    return this.repo.create({
      userId: new Types.ObjectId(userId),
      content: dto.content,
      specializationId: specializationObjectIds,
      status: QuestionStatus.PENDING,
    });
  }

  async findAll() {
    return this.repo.findAll();
  }

  async findOne(id: string) {
    const question = await this.repo.findById(id);
    if (!question) {
      throw new NotFoundException('question.NOT_FOUND');
    }
    return question;
  }
}
