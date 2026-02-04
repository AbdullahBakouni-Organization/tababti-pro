import { Injectable, NotFoundException } from '@nestjs/common';
import { QuestionsRepository } from '../repository/questions.repository';
import { CreateQuestionDto } from '../dto/create-question.dto';

@Injectable()
export class QuestionsService {
  constructor(private readonly repo: QuestionsRepository) {}

  async create(dto: CreateQuestionDto, userId: string) {
    return this.repo.create({
      ...dto,
      userId,
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
