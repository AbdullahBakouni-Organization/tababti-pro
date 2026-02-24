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
import { Hospital } from '@app/common/database/schemas/hospital.schema';
import { Center } from '@app/common/database/schemas/center.schema';

import {
  AnswerStatus,
  PrivateMedicineSpecialty,
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
    @InjectModel(Hospital.name) private readonly hospitalModel: Model<Hospital>,
    @InjectModel(Center.name) private readonly centerModel: Model<Center>,
  ) { }

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
        answersCount:
          q.status === QuestionStatus.ANSWERED ? q.answers.length : 0,
        answers:
          q.status === QuestionStatus.ANSWERED
            ? q.answers.map((a) => ({
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
            }))
            : [],
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
    let { questionId, responderType, responderId, content } = dto;

    if (!Types.ObjectId.isValid(questionId))
      throw new BadRequestException('question.INVALID_ID');

    if (!Types.ObjectId.isValid(responderId))
      throw new BadRequestException('user.INVALID_ID');

    if (responderType === UserRole.USER) {
      throw new BadRequestException('question.ONLY_PROVIDERS_CAN_ANSWER');
    }

    let realResponderId: Types.ObjectId | null = null;

    if (responderType === UserRole.DOCTOR) {
      const doctor = await this.doctorModel.findOne({
        authAccountId: new Types.ObjectId(responderId),
      });

      if (!doctor) throw new NotFoundException('doctor.NOT_FOUND');

      realResponderId = doctor._id;
    }

    if (responderType === UserRole.HOSPITAL) {
      const hospital = await this.hospitalModel.findOne({
        authAccountId: new Types.ObjectId(responderId),
      });

      if (!hospital) throw new NotFoundException('hospital.NOT_FOUND');

      realResponderId = hospital._id;
    }

    if (responderType === UserRole.CENTER) {
      const center = await this.centerModel.findOne({
        authAccountId: new Types.ObjectId(responderId),
      });

      if (!center) throw new NotFoundException('center.NOT_FOUND');

      realResponderId = center._id;
    }

    if (!realResponderId) throw new BadRequestException('user.INVALID_ROLE');

    const question = await this.repo.findById(questionId);
    if (!question) throw new NotFoundException('question.NOT_FOUND');

    const existingAnswer = await this.answerModel.findOne({
      questionId: new Types.ObjectId(questionId),
      responderId: realResponderId,
    });

    if (existingAnswer) {
      throw new BadRequestException('question.ALREADY_ANSWERED_BY_YOU');
    }

    const answer = new this.answerModel({
      questionId: new Types.ObjectId(questionId),
      responderType,
      responderId: realResponderId,
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

  async getDoctorQuestions(
    authAccountId: string,
    filter: 'all' | 'specialization' | 'myAnswers' = 'all',
  ) {
    if (!Types.ObjectId.isValid(authAccountId)) {
      throw new BadRequestException('doctor.INVALID_ID');
    }

    const doctor = await this.doctorModel.findOne({
      authAccountId: new Types.ObjectId(authAccountId),
    });

    if (!doctor) {
      throw new NotFoundException('doctor.NOT_FOUND');
    }

    let match: any = {};

    // Get all answers by this doctor
    const myAnswers = await this.answerModel
      .find({ responderId: doctor._id }, { questionId: 1, _id: 0 })
      .lean();
    const answeredQuestionIds = myAnswers.map((a) => a.questionId);

    if (filter === 'all') {
      // Exclude questions already answered by this doctor
      if (answeredQuestionIds.length) {
        match._id = { $nin: answeredQuestionIds };
      }
    }

    if (filter === 'specialization') {
      match = await this.specializationsService.buildQuestionSpecializationMatch(
        doctor.privateSpecialization,
      );
      // Exclude already answered questions
      if (answeredQuestionIds.length) {
        match._id = match._id
          ? { $in: match._id.$in, $nin: answeredQuestionIds } // merge with existing
          : { $nin: answeredQuestionIds };
      }
    }

    if (filter === 'myAnswers') {
      // Only questions doctor answered
      if (!answeredQuestionIds.length) {
        return [];
      }
      match._id = { $in: answeredQuestionIds };
    }

    const questions = await this.repo.findQuestionsWithAnswers(match);

    return questions.map((q) => {
      let answersToReturn = [];

      if (q.status === 'answered') {
        if (filter === 'all' || filter === 'specialization') {
          // Show only other users' answers (exclude this doctor)
          answersToReturn = q.answers
            .filter((a) => a?._id && !a.responder?._id.equals(doctor._id))
            .map((a) => ({
              _id: a._id,
              content: a.content,
              responderName: a.responder
                ? `${a.responder.firstName} ${a.responder.middleName || ''} ${a.responder.lastName}`.trim()
                : 'Unknown',
              responderImage: a.responder?.image || null,
              answeredAgo: this.timeAgo(a.createdAt),
            }));
        }

        if (filter === 'myAnswers') {
          // Show only this doctor's answer
          answersToReturn = q.answers
            .filter((a) => a?._id && a.responder?._id.equals(doctor._id))
            .map((a) => ({
              _id: a._id,
              content: a.content,
              responderName: a.responder
                ? `${a.responder.firstName} ${a.responder.middleName || ''} ${a.responder.lastName}`.trim()
                : 'Unknown',
              responderImage: a.responder?.image || null,
              answeredAgo: this.timeAgo(a.createdAt),
            }));
        }
      }

      return {
        _id: q._id,
        content: q.content,
        status: q.status,
        asker: {
          name: q.asker?.name || 'Unknown',
          image: q.asker?.image || null,
        },
        specializations: q.specializations,
        answersCount: answersToReturn.length,
        answers: answersToReturn,
        createdAt: q.createdAt,
        updatedAt: q.updatedAt,
      };
    });
  }
}
