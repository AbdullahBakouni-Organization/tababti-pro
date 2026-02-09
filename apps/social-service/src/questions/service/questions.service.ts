import {
  Injectable,
  NotFoundException,
  InternalServerErrorException,
  BadRequestException,
} from '@nestjs/common';
import { Types, Model } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';
import { QuestionsRepository } from '../repository/questions.repository';
import { CreateQuestionDto } from '../dto/create-question.dto';
import { Question } from '@app/common/database/schemas/question.schema';
import { Answer } from '@app/common/database/schemas/answer.schema';
import { User } from '@app/common/database/schemas/user.schema';
import { Doctor } from '@app/common/database/schemas/doctor.schema';
import {
  QuestionStatus,
  UserRole,
} from '@app/common/database/schemas/common.enums';
import { SpecializationsService } from '../../specializations/specializations.service';

@Injectable()
export class QuestionsService {
  constructor(
    private readonly repo: QuestionsRepository,
    private readonly specializationsService: SpecializationsService,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(Answer.name) private readonly answerModel: Model<Answer>,
    @InjectModel(Question.name) private readonly questionModel: Model<Question>,
    @InjectModel(Doctor.name) private readonly doctorModel: Model<Doctor>,
  ) {}

  async create(
    dto: CreateQuestionDto,
    authAccountId: string,
    lang: 'en' | 'ar',
  ) {
    const user = await this.userModel.findOne({
      authAccountId: new Types.ObjectId(authAccountId),
    });
    if (!user) throw new NotFoundException('user.NOT_FOUND');

    const specializationIds =
      await this.specializationsService.validateAndGetIds(dto.specializationId);

    return this.repo.create({
      userId: user._id,
      content: dto.content,
      specializationId: specializationIds,
      status: QuestionStatus.PENDING,
    });
  }

  async getQuestions(
    authAccountId: string,
    filter: 'allQuestions' | 'answered' | 'pending' | 'public',
    publicSpecializationId?: string,
    privateSpecializationIds?: string[],
  ) {
    try {
      const match: any = {};

      if (filter === 'answered') match.status = QuestionStatus.ANSWERED;
      if (filter === 'pending') match.status = QuestionStatus.PENDING;

      if (privateSpecializationIds?.length) {
        match.specializationId = {
          $in: privateSpecializationIds.map((id) => {
            if (!Types.ObjectId.isValid(id))
              throw new BadRequestException('specialization.INVALID_ID');
            return new Types.ObjectId(id);
          }),
        };
      }

      if (filter === 'public') {
        const privateSpecs =
          await this.specializationsService.getPrivateIdsByPublicName(
            'طب_بشري',
          );

        match.specializationId = { $in: privateSpecs };
      }

      if (publicSpecializationId) {
        if (!Types.ObjectId.isValid(publicSpecializationId))
          throw new BadRequestException('specialization.INVALID_ID');

        const privateSpecs =
          await this.specializationsService.getPrivateIdsByPublic(
            publicSpecializationId,
          );

        match.specializationId = { $in: privateSpecs };
      }

      const questions = await this.repo.findQuestionsWithAnswers(match);

      return questions.map((q) => ({
        _id: q._id,
        content: q.content,
        status: q.status,
        specializations: q.specializations,
        answersCount: q.answers.length,
        answers: q.answers.map((a) => ({
          _id: a._id,
          content: a.content,
          responderName:
            a.responder?.firstName +
              ' ' +
              a.responder?.middleName +
              ' ' +
              a.responder?.lastName || 'Unknown',
          responderImage: a.responder?.image || null,
          answeredAgo: a.createdAt ? this.timeAgo(a.createdAt) : null,
        })),
        createdAt: q.createdAt,
        updatedAt: q.updatedAt,
      }));
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      )
        throw error;

      console.error('❌ Unexpected error in getQuestions:', error);
      throw new InternalServerErrorException('common.ERROR');
    }
  }

  async answerQuestion(dto: {
    questionId: string;
    responderType: UserRole;
    responderId: string;
    content: string;
  }) {
    const { questionId, responderType, responderId, content } = dto;

    if (!Types.ObjectId.isValid(questionId))
      throw new BadRequestException('question.INVALID_ID');
    if (!Types.ObjectId.isValid(responderId))
      throw new BadRequestException('user.INVALID_ID');

    const question = await this.repo.findById(questionId);
    if (!question) throw new NotFoundException('question.NOT_FOUND');

    const existingAnswer = await this.answerModel.findOne({
      questionId: new Types.ObjectId(questionId),
      responderId: new Types.ObjectId(responderId),
    });

    if (existingAnswer) {
      throw new BadRequestException('question.ALREADY_ANSWERED_BY_YOU');
    }

    const answer = new this.answerModel({
      questionId: new Types.ObjectId(questionId),
      responderType,
      responderId: new Types.ObjectId(responderId),
      content,
    });

    await answer.save();

    if (question.status !== QuestionStatus.ANSWERED) {
      question.status = QuestionStatus.ANSWERED;
      await question.save();
    }

    return answer;
  }

  private timeAgo(date: Date) {
    const diff = Date.now() - new Date(date).getTime();
    const minutes = Math.floor(diff / 1000 / 60);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes} minutes ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hours ago`;
    const days = Math.floor(hours / 24);
    return `${days} days ago`;
  }
}
