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
  QuestionStatus,
  UserRole,
} from '@app/common/database/schemas/common.enums';
import { SpecializationsService } from '../../specializations/specializations.service';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AnswerQuestionDto {
  questionId: string;
  responderType: UserRole;
  responderId: string;
  content: string;
}

interface MappedAnswer {
  _id: Types.ObjectId;
  content: string;
  responderName: string;
  responderImage: string | null;
  answeredAgo: string | null;
}

interface MappedQuestion {
  _id: Types.ObjectId;
  content: string;
  status: QuestionStatus;
  specializations: any[];
  answersCount: number;
  answers: MappedAnswer[];
  createdAt: Date;
  updatedAt: Date;
  asker?: { name: string; image: string | null };
}

// ─── Service ─────────────────────────────────────────────────────────────────

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
  ) {}

  // ── Create ────────────────────────────────────────────────────────────────

  async create(
    dto: CreateQuestionDto,
    authAccountId: string,
    lang: 'en' | 'ar',
  ) {
    const user = await this.userModel
      .findOne({ authAccountId: new Types.ObjectId(authAccountId) })
      .lean();

    if (!user) throw new NotFoundException('user.NOT_FOUND');

    const specializationIds =
      (await this.specializationsService.validateAndGetIds(
        dto.specializationId,
      )) as any;

    return this.repo.create({
      userId: user._id,
      content: dto.content,
      specializationId: specializationIds,
      status: QuestionStatus.PENDING,
    });
  }

  // ── Get Questions (general feed) ──────────────────────────────────────────

  async getQuestions(
    authAccountId: string,
    filter: 'allQuestions' | 'answered' | 'pending' | 'public' = 'allQuestions',
    publicSpecializationId?: string,
    privateSpecializationIds?: string[],
    page = 1,
    limit = 10,
  ) {
    try {
      const match: Record<string, any> = {};

      if (filter === 'answered') match.status = QuestionStatus.ANSWERED;
      if (filter === 'pending') match.status = QuestionStatus.PENDING;

      // Filter by explicit private specialization IDs
      if (privateSpecializationIds?.length) {
        match.specializationId = {
          $in: privateSpecializationIds.map((id) => {
            if (!Types.ObjectId.isValid(id))
              throw new BadRequestException('specialization.INVALID_ID');
            return new Types.ObjectId(id);
          }),
        };
      }

      // Public filter — maps the well-known public name to its private IDs
      if (filter === 'public') {
        const privateSpecs =
          await this.specializationsService.getPrivateIdsByPublicName(
            'طب_بشري',
          );
        match.specializationId = { $in: privateSpecs };
      }

      // Filter by a specific public specialization
      if (publicSpecializationId) {
        if (!Types.ObjectId.isValid(publicSpecializationId))
          throw new BadRequestException('specialization.INVALID_ID');

        const privateSpecs =
          await this.specializationsService.getPrivateIdsByPublic(
            publicSpecializationId,
          );
        match.specializationId = { $in: privateSpecs };
      }

      const skip = (page - 1) * limit;
      const { questions, total, totalPages } =
        await this.repo.findQuestionsWithAnswers(match, skip, limit);

      return {
        questions: questions.map(this.mapQuestion.bind(this)),
        total,
        page,
        limit,
        totalPages,
      };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      )
        throw error;
      console.error('Unexpected error in getQuestions:', error);
      throw new InternalServerErrorException('common.ERROR');
    }
  }

  // ── Answer a Question ─────────────────────────────────────────────────────

  async answerQuestion(dto: AnswerQuestionDto) {
    const { questionId, responderType, responderId, content } = dto;

    if (!Types.ObjectId.isValid(questionId))
      throw new BadRequestException('question.INVALID_ID');

    if (!Types.ObjectId.isValid(responderId))
      throw new BadRequestException('user.INVALID_ID');

    if (responderType === UserRole.USER)
      throw new BadRequestException('question.ONLY_PROVIDERS_CAN_ANSWER');

    const realResponderId = await this.resolveResponderId(
      responderType,
      responderId,
    );

    const question = await this.repo.findById(questionId);
    if (!question) throw new NotFoundException('question.NOT_FOUND');

    const alreadyAnswered = await this.answerModel
      .exists({
        questionId: new Types.ObjectId(questionId),
        responderId: realResponderId,
      })
      .lean();

    if (alreadyAnswered)
      throw new BadRequestException('question.ALREADY_ANSWERED_BY_YOU');

    const answer = await this.answerModel.create({
      questionId: new Types.ObjectId(questionId),
      responderType,
      responderId: realResponderId,
      content,
    });

    // Update question status only once (avoids a redundant save)
    if (question.status !== QuestionStatus.ANSWERED) {
      await this.questionModel.updateOne(
        { _id: question._id },
        { status: QuestionStatus.ANSWERED },
      );
    }

    return answer;
  }

  // ── Doctor-specific Questions ─────────────────────────────────────────────

  async getDoctorQuestions(
    authAccountId: string,
    filter: 'all' | 'specialization' | 'myAnswers' = 'all',
    page = 1,
    limit = 10,
  ) {
    if (!Types.ObjectId.isValid(authAccountId))
      throw new BadRequestException('doctor.INVALID_ID');

    const doctor = await this.doctorModel
      .findOne({ authAccountId: new Types.ObjectId(authAccountId) })
      .lean();

    if (!doctor) throw new NotFoundException('doctor.NOT_FOUND');

    const answeredQuestionIds = await this.getAnsweredQuestionIds(
      doctor._id as Types.ObjectId,
    );

    const match = await this.buildDoctorMatch(
      filter,
      answeredQuestionIds,
      doctor,
    );

    // Short-circuit: doctor asked for their answers but has none yet
    if (filter === 'myAnswers' && !answeredQuestionIds.length) {
      return { questions: [], total: 0, page, limit, totalPages: 0 };
    }

    const skip = (page - 1) * limit;
    const { questions, total, totalPages } =
      await this.repo.findQuestionsWithAnswers(match, skip, limit);

    return {
      questions: questions.map(this.mapDoctorQuestion.bind(this)),
      total,
      page,
      limit,
      totalPages,
    };
  }

  // ── Private Helpers ───────────────────────────────────────────────────────

  /**
   * Resolves the internal profile _id for the given responder role.
   * Throws NotFoundException when the profile does not exist.
   */
  private async resolveResponderId(
    role: UserRole,
    authAccountId: string,
  ): Promise<Types.ObjectId> {
    const authId = new Types.ObjectId(authAccountId);

    const modelMap: Partial<Record<UserRole, Model<any>>> = {
      [UserRole.DOCTOR]: this.doctorModel,
      [UserRole.HOSPITAL]: this.hospitalModel,
      [UserRole.CENTER]: this.centerModel,
    };

    const model = modelMap[role];
    if (!model) throw new BadRequestException('user.INVALID_ROLE');

    const profile = await model
      .findOne({ authAccountId: authId }, { _id: 1 })
      .lean();

    const notFoundKey: Record<string, string> = {
      [UserRole.DOCTOR]: 'doctor.NOT_FOUND',
      [UserRole.HOSPITAL]: 'hospital.NOT_FOUND',
      [UserRole.CENTER]: 'center.NOT_FOUND',
    };

    if (!profile) throw new NotFoundException(notFoundKey[role]);

    return (profile as any)._id;
  }

  /** Returns an array of questionIds already answered by the given doctor. */
  private async getAnsweredQuestionIds(
    doctorId: Types.ObjectId,
  ): Promise<Types.ObjectId[]> {
    const answers = await this.answerModel
      .find({ responderId: doctorId }, { questionId: 1 })
      .lean();
    return answers.map((a) => a.questionId as Types.ObjectId);
  }

  /** Builds the MongoDB match stage for the doctor questions endpoint. */
  private async buildDoctorMatch(
    filter: 'all' | 'specialization' | 'myAnswers',
    answeredIds: Types.ObjectId[],
    doctor: any,
  ): Promise<Record<string, any>> {
    const match: Record<string, any> = {};

    if (filter === 'all') {
      if (answeredIds.length) match._id = { $nin: answeredIds };
      return match;
    }

    if (filter === 'specialization') {
      const specMatch =
        await this.specializationsService.buildQuestionSpecializationMatch(
          doctor.privateSpecialization,
        );
      Object.assign(match, specMatch);

      if (answeredIds.length) {
        // Keep only questions inside the specialization that are not yet answered
        if (match._id?.$in) {
          match._id.$in = match._id.$in.filter(
            (id: Types.ObjectId) =>
              !answeredIds.some((a) => a.toString() === id.toString()),
          );
        } else {
          match._id = { $nin: answeredIds };
        }
      }
      return match;
    }

    // filter === 'myAnswers'
    if (answeredIds.length) match._id = { $in: answeredIds };
    return match;
  }

  /** Maps a raw aggregation question document to a public-safe shape. */
  private mapQuestion(q: any): MappedQuestion {
    return {
      _id: q._id,
      content: q.content,
      status: q.status,
      specializations: q.specializations ?? [],
      answersCount: q.answers?.length ?? 0,
      answers: (q.answers ?? []).map(this.mapAnswer.bind(this)),
      createdAt: q.createdAt,
      updatedAt: q.updatedAt,
    };
  }

  /** Adds asker info on top of the base question mapping (used for doctors). */
  private mapDoctorQuestion(q: any): MappedQuestion & { asker: any } {
    return {
      ...this.mapQuestion(q),
      asker: {
        name: q.asker?.name ?? 'Unknown',
        image: q.asker?.image ?? null,
      },
    };
  }

  private mapAnswer(a: any): MappedAnswer {
    const parts = [
      a.responder?.firstName,
      a.responder?.middleName,
      a.responder?.lastName,
    ].filter(Boolean);
    return {
      _id: a._id,
      content: a.content,
      responderName: parts.length ? parts.join(' ') : 'Unknown',
      responderImage: a.responder?.image ?? null,
      answeredAgo: a.createdAt ? this.timeAgo(a.createdAt) : null,
    };
  }

  private timeAgo(date: Date): string {
    const diffMs = Date.now() - new Date(date).getTime();
    const minutes = Math.floor(diffMs / 60_000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes} minutes ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hours ago`;
    return `${Math.floor(hours / 24)} days ago`;
  }
}
