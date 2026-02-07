import {
  Injectable,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { Types, Model } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';
import { QuestionsRepository } from '../repository/questions.repository';
import { CreateQuestionDto } from '../dto/create-question.dto';
import {
  AnswerStatus,
  QuestionStatus,
  UserRole,
} from '@app/common/database/schemas/common.enums';
import { PrivateSpecialization } from '@app/common/database/schemas/privatespecializations.schema';
import { User } from '@app/common/database/schemas/user.schema';
import { Answer } from '@app/common/database/schemas/answer.schema';
import { AnswerQuestionDto } from '../dto/answer-question.dto';
import { Question } from '@app/common/database/schemas/question.schema';

@Injectable()
export class QuestionsService {
  constructor(
    private readonly repo: QuestionsRepository,
    @InjectModel(PrivateSpecialization.name)
    private readonly specializationModel: Model<PrivateSpecialization>,
    @InjectModel(User.name)
    private readonly userModel: Model<User>,
    @InjectModel(Answer.name) private readonly answerModel: Model<Answer>,
    @InjectModel(Question.name)
    private readonly questionModel: Model<Question>,
  ) {}

  async create(dto: CreateQuestionDto, authAccountId: string) {
    const user = await this.userModel.findOne({
      authAccountId: new Types.ObjectId(authAccountId),
    });

    if (!user) {
      throw new NotFoundException('user.NOT_FOUND');
    }

    try {
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
        userId: user._id,
        content: dto.content,
        specializationId: specializationObjectIds,
        status: QuestionStatus.PENDING,
      });
    } catch (error) {
      console.error('❌ Error in create Question:', error);
      throw error instanceof NotFoundException
        ? error
        : new InternalServerErrorException('common.ERROR');
    }
  }

  async getQuestions(
    authAccountId: string,
    filter: 'allQuestions' | 'answered' | 'pending',
    publicSpecializationId?: string,
    privateSpecializationIds?: string[],
  ) {
    try {
      let match: any = {};

      if (filter === 'answered' || filter === 'pending') {
        const user = await this.userModel.findOne({
          authAccountId: new Types.ObjectId(authAccountId),
        });
        if (!user) throw new NotFoundException('user.NOT_FOUND');

        match.userId = user._id;
        if (filter === 'answered') match.status = QuestionStatus.ANSWERED;
        if (filter === 'pending') match.status = QuestionStatus.PENDING;
      }

      if (privateSpecializationIds && privateSpecializationIds.length > 0) {
        match.specializationId = {
          $in: privateSpecializationIds.map((id) => new Types.ObjectId(id)),
        };
      }

      if (publicSpecializationId) {
        const privateSpecs = await this.specializationModel.find({
          publicSpecializationId: new Types.ObjectId(publicSpecializationId),
        });

        if (privateSpecs.length > 0) {
          match.specializationId = {
            $in: privateSpecs.map((p) => p._id),
          };
        } else {
          return [];
        }
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
          responderName: a.responder?.name || 'Unknown',
          responderImage: a.responder?.avatar || null,
          answeredAgo: a.createdAt ? this.timeAgo(a.createdAt) : null,
        })),
        createdAt: q.createdAt,
        updatedAt: q.updatedAt,
      }));
    } catch (error) {
      console.error('❌ Error in getQuestions:', error);
      throw new InternalServerErrorException(error.message || 'common.ERROR');
    }
  }

  async answerQuestion(dto: {
    questionId: string;
    responderType: UserRole;
    responderId: string;
    content: string;
  }) {
    const { questionId, responderType, responderId, content } = dto;

    const question = await this.repo.findById(questionId);
    if (!question) {
      throw new NotFoundException('question.NOT_FOUND');
    }

    if (question.status === QuestionStatus.ANSWERED) {
      throw new InternalServerErrorException('question.ALREADY_ANSWERED');
    }

    const answer = new this.answerModel({
      questionId: new Types.ObjectId(questionId),
      responderType,
      responderId: new Types.ObjectId(responderId),
      content,
    });

    await answer.save();

    question.status = QuestionStatus.ANSWERED;
    await question.save();

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
