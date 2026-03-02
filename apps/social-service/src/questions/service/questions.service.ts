import {
  Injectable,
  NotFoundException,
  InternalServerErrorException,
  BadRequestException,
  ForbiddenException,
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
import {
  MappedAnswer,
  MappedQuestion,
  QuestionPageResult,
} from '../interface/question.interfaces';

interface AnswerQuestionParams {
  questionId: string;
  responderType: UserRole;
  responderId: string;
  content: string;
}

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

  // ══════════════════════════════════════════════════════════════
  // CREATE
  // ══════════════════════════════════════════════════════════════

  async create(
    dto: CreateQuestionDto,
    authAccountId: string,
    lang: 'en' | 'ar' = 'en',
  ): Promise<Question> {
    if (!Types.ObjectId.isValid(authAccountId))
      throw new BadRequestException('user.INVALID_ID');

    const user = await this.userModel
      .findOne({ authAccountId: new Types.ObjectId(authAccountId) })
      .lean();

    if (!user) throw new NotFoundException('user.NOT_FOUND');

    const specializationIds = await this.specializationsService.validateAndGetIds(
      dto.specializationId,
    ) as any;

    return this.repo.create({
      userId: (user as any)._id,
      content: dto.content,
      specializationId: specializationIds,
      status: QuestionStatus.PENDING,
    });
  }

  // ══════════════════════════════════════════════════════════════
  // GET QUESTIONS — General feed (non-doctor users)
  // ══════════════════════════════════════════════════════════════

  async getQuestions(
    authAccountId: string,
    filter: 'allQuestions' | 'answered' | 'pending' | 'public' = 'allQuestions',
    publicSpecializationId?: string,
    privateSpecializationIds?: string[],
    page = 1,
    limit = 10,
  ): Promise<QuestionPageResult> {
    try {
      const match: Record<string, any> = {};

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
        const privateSpecs = await this.specializationsService.getPrivateIdsByPublicName('طب_بشري');
        match.specializationId = { $in: privateSpecs };
      }

      if (publicSpecializationId) {
        if (!Types.ObjectId.isValid(publicSpecializationId))
          throw new BadRequestException('specialization.INVALID_ID');
        const privateSpecs = await this.specializationsService.getPrivateIdsByPublic(publicSpecializationId);
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
      if (error instanceof NotFoundException || error instanceof BadRequestException)
        throw error;
      console.error('[QuestionsService.getQuestions]', error);
      throw new InternalServerErrorException('common.ERROR');
    }
  }

  // ══════════════════════════════════════════════════════════════
  // GET DOCTOR QUESTIONS
  //
  // all:
  //   - All unanswered questions (ANY specialization)
  //   - Status: PENDING (not yet answered by any doctor)
  //   - Excludes: questions this doctor has already answered
  //   - Shows: all answers with isMyAnswer flag
  //
  // specialization:
  //   - Questions related to doctor's general/broad field
  //   - Includes all sub-specializations under doctor's main specialty
  //   - Example: Doctor="Dentistry" sees Endodontics, Orthodontics, etc.
  //   - Status: PENDING (not yet answered)
  //   - Excludes: questions this doctor has already answered
  //   - Shows: all answers with isMyAnswer flag
  //   - Use: doctor focuses on their general field
  //
  // myAnswers:
  //   - Questions this doctor HAS answered
  //   - Shows: ONLY this doctor's answer (showOnlyMine = true)
  //   - Hides: other doctors' answers
  //   - Use: doctor reviews their own answers
  // ══════════════════════════════════════════════════════════════

  async getDoctorQuestions(
    authAccountId: string,
    filter: 'all' | 'specialization' | 'myAnswers' = 'all',
    page = 1,
    limit = 10,
  ): Promise<QuestionPageResult> {
    if (!Types.ObjectId.isValid(authAccountId))
      throw new BadRequestException('doctor.INVALID_ID');

    const doctor = await this.doctorModel
      .findOne({ authAccountId: new Types.ObjectId(authAccountId) })
      .lean();

    if (!doctor) throw new NotFoundException('doctor.NOT_FOUND');

    const doctorProfileId = (doctor as any)._id as Types.ObjectId;

    // IDs of questions this doctor has already answered
    const answeredQuestionIds = await this.getAnsweredQuestionIds(doctorProfileId);

    // Short-circuit: no answers yet for myAnswers filter
    if (filter === 'myAnswers' && !answeredQuestionIds.length) {
      return { questions: [], total: 0, page, limit, totalPages: 0 };
    }

    const match = await this.buildDoctorMatch(filter, answeredQuestionIds, doctor);
    const skip = (page - 1) * limit;

    // showOnlyMine = true means: filter answers to show ONLY this doctor's answer
    // This is only used for 'myAnswers' filter
    const showOnlyMine = filter === 'myAnswers';

    const { questions, total, totalPages } =
      await this.repo.findDoctorQuestionsWithAnswers(
        match, skip, limit, doctorProfileId, showOnlyMine,
      );

    return {
      questions: questions.map((q) => this.mapDoctorQuestion(q)),
      total,
      page,
      limit,
      totalPages,
    };
  }
  // ══════════════════════════════════════════════════════════════
  // ANSWER QUESTION
  // ══════════════════════════════════════════════════════════════

  async answerQuestion(params: AnswerQuestionParams): Promise<Answer> {
    const { questionId, responderType, responderId, content } = params;

    if (!Types.ObjectId.isValid(questionId))
      throw new BadRequestException('question.INVALID_ID');

    if (!Types.ObjectId.isValid(responderId))
      throw new BadRequestException('user.INVALID_ID');

    if (responderType === UserRole.USER)
      throw new BadRequestException('question.ONLY_PROVIDERS_CAN_ANSWER');

    const realResponderId = await this.resolveResponderId(responderType, responderId);

    const question = await this.repo.findById(questionId);
    if (!question) throw new NotFoundException('question.NOT_FOUND');

    const alreadyAnswered = await this.answerModel
      .exists({ questionId: new Types.ObjectId(questionId), responderId: realResponderId })
      .lean();

    if (alreadyAnswered)
      throw new BadRequestException('question.ALREADY_ANSWERED_BY_YOU');

    const answer = await this.answerModel.create({
      questionId: new Types.ObjectId(questionId),
      responderType,
      responderId: realResponderId,
      content,
    });

    if ((question as any).status !== QuestionStatus.ANSWERED) {
      await this.questionModel.updateOne(
        { _id: (question as any)._id },
        { status: QuestionStatus.ANSWERED },
      );
    }

    return answer;
  }

  // ══════════════════════════════════════════════════════════════
  // DELETE QUESTION (owner only)
  // ══════════════════════════════════════════════════════════════

  async deleteQuestion(
    questionId: string,
    authAccountId: string,
  ): Promise<Question | null> {
    if (!Types.ObjectId.isValid(questionId))
      throw new BadRequestException('question.INVALID_ID');

    if (!Types.ObjectId.isValid(authAccountId))
      throw new BadRequestException('user.INVALID_ID');

    const user = await this.userModel
      .findOne({ authAccountId: new Types.ObjectId(authAccountId) })
      .lean();

    if (!user) throw new NotFoundException('user.NOT_FOUND');

    const question = await this.repo.findById(questionId);
    if (!question) throw new NotFoundException('question.NOT_FOUND');

    if ((question as any).userId.toString() !== (user as any)._id.toString())
      throw new ForbiddenException('question.FORBIDDEN');

    await this.answerModel.deleteMany({ questionId: new Types.ObjectId(questionId) });

    return this.repo.delete(questionId);
  }

  // ══════════════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ══════════════════════════════════════════════════════════════

  private async resolveResponderId(
    role: UserRole,
    authAccountId: string,
  ): Promise<Types.ObjectId> {
    const modelMap: Partial<Record<UserRole, Model<any>>> = {
      [UserRole.DOCTOR]: this.doctorModel,
      [UserRole.HOSPITAL]: this.hospitalModel,
      [UserRole.CENTER]: this.centerModel,
    };

    const model = modelMap[role];
    if (!model) throw new BadRequestException('user.INVALID_ROLE');

    const profile = await model
      .findOne({ authAccountId: new Types.ObjectId(authAccountId) }, { _id: 1 })
      .lean();

    const notFoundKey: Record<string, string> = {
      [UserRole.DOCTOR]: 'doctor.NOT_FOUND',
      [UserRole.HOSPITAL]: 'hospital.NOT_FOUND',
      [UserRole.CENTER]: 'center.NOT_FOUND',
    };

    if (!profile) throw new NotFoundException(notFoundKey[role]);

    return (profile as any)._id;
  }

  private async getAnsweredQuestionIds(
    doctorProfileId: Types.ObjectId,
  ): Promise<Types.ObjectId[]> {
    const answers = await this.answerModel
      .find({ responderId: doctorProfileId }, { questionId: 1 })
      .lean();
    return answers.map((a) => a.questionId as Types.ObjectId);
  }

  // ─────────────────────────────────────────────────────────────
  // buildDoctorMatch
  //
  // Constructs the MongoDB match stage for different doctor filters
  //
  // 'all':
  //   - Shows ALL questions from ANY specialization
  //   - Status: PENDING (unanswered)
  //   - Excludes: questions doctor already answered
  //   - No specialization filter
  //   - Example: Shows questions from any field
  //
  // 'specialization':
  //   - Filter: doctor's general/PUBLIC specialization with all sub-specialties
  //   - Status: PENDING (unanswered)
  //   - Excludes: questions doctor already answered
  //   - Example: Doctor specializes in "Dentistry" → sees "Endodontics", 
  //             "Orthodontics", "Prosthodontics", etc.
  //   - Gets all private spec IDs under doctor's public specialization
  //
  // 'myAnswers':
  //   - Filter: only questions doctor has answered
  //   - Returns: questions by ID from answeredIds array
  // ─────────────────────────────────────────────────────────────

  private async buildDoctorMatch(
    filter: 'all' | 'specialization' | 'myAnswers',
    answeredIds: Types.ObjectId[],
    doctor: any,
  ): Promise<Record<string, any>> {
    const match: Record<string, any> = {};

    // ── myAnswers ──────────────────────────────────────────────
    // Questions this doctor has answered
    if (filter === 'myAnswers') {
      // answeredIds is guaranteed non-empty here (checked before calling)
      match._id = { $in: answeredIds };
      return match;
    }

    // ── all ────────────────────────────────────────────────────
    // All unanswered questions from ANY specialization
    if (filter === 'all') {
      // NO specialization filter - show questions from all specialties
      // Only exclude questions already answered by this doctor

      if (answeredIds.length) {
        match._id = { $nin: answeredIds };
      }

      return match;
    }

    // ── specialization ─────────────────────────────────────────
    // Questions related to doctor's general/broad specialization
    // Shows all sub-specializations under the doctor's main field
    // Example: Doctor specializes in "Dentistry" → sees "Endodontics", 
    //          "Orthodontics", "Prosthodontics", etc.

    if (doctor.publicSpecialization) {
      // Get all private spec IDs that fall under this doctor's public specialization
      const privateSpecIds = await this.specializationsService
        .getPrivateIdsByPublicName(doctor.publicSpecialization)
        .catch(() => [] as Types.ObjectId[]);

      if (privateSpecIds.length) {
        match.specializationId = { $in: privateSpecIds };
      }
      // If no private specs found, fallthrough with empty match
    }

    // Exclude questions already answered by this doctor
    if (answeredIds.length) {
      match._id = { $nin: answeredIds };
    }

    return match;
  }

  // ── Mappers ───────────────────────────────────────────────────────────────

  private mapQuestion(q: any): MappedQuestion {
    return {
      _id: q._id,
      content: q.content,
      status: q.status,
      specializations: q.specializations ?? [],
      answersCount: q.answersCount ?? q.answers?.length ?? 0,
      answers: (q.answers ?? []).map(this.mapAnswer.bind(this)),
      createdAt: q.createdAt,
      updatedAt: q.updatedAt,
    };
  }

  private mapDoctorQuestion(q: any): MappedQuestion {
    return {
      ...this.mapQuestion(q),
      asker: {
        name: q.asker?.username ?? q.asker?.name ?? 'Unknown',
        image: q.asker?.image ?? null,
      },
    };
  }

  private mapAnswer(a: any): MappedAnswer {
    const nameParts = [
      a.responder?.firstName,
      a.responder?.middleName,
      a.responder?.lastName,
    ].filter(Boolean);

    return {
      _id: a._id,
      content: a.content,
      responderName: nameParts.length
        ? nameParts.join(' ')
        : (a.responder?.username ?? 'Unknown'),
      responderImage: a.responder?.image ?? null,
      answeredAgo: a.createdAt ? this.timeAgo(a.createdAt) : null,
      createdAt: a.createdAt,
      isMyAnswer: a.isMyAnswer ?? false,
    };
  }

  private timeAgo(date: Date): string {
    const diffMs = Date.now() - new Date(date).getTime();
    const minutes = Math.floor(diffMs / 60_000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  }
}