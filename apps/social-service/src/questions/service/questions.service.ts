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
import {
  ModerateQuestionDto,
  ModerationAction,
} from '../dto/moderate-question.dto';
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
  ModerationResult,
  QuestionPageResult,
  QuestionStats,
  SpecializationStat,
} from '../interface/question.interfaces';

interface AnswerQuestionParams {
  questionId: string;
  responderType: UserRole;
  responderId: string;
  content: string;
}

function pct(part: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((part / total) * 10_000) / 100;
}

// ── Visibility rule ───────────────────────────────────────────────────────────
// PENDING  → awaiting admin moderation  → hidden
// APPROVED → approved by admin          → visible
// ANSWERED → at least one answer        → visible
// REJECTED → rejected by admin          → hidden
// DELETED  → soft-deleted               → hidden
const VISIBLE_STATUSES: QuestionStatus[] = [
  QuestionStatus.APPROVED,
  QuestionStatus.ANSWERED,
];

function visibleMatch(extra: Record<string, any> = {}): Record<string, any> {
  return { ...extra, status: { $in: VISIBLE_STATUSES } };
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
  ) {}

  // ══════════════════════════════════════════════════════════════════════════
  // CREATE — text only, images only, or both
  // ══════════════════════════════════════════════════════════════════════════

  async create(
    dto: CreateQuestionDto,
    authAccountId: string,
    lang: 'en' | 'ar' = 'en',
  ): Promise<Question> {
    if (!Types.ObjectId.isValid(authAccountId))
      throw new BadRequestException('user.INVALID_ID');

    // ── Must have text OR images (or both) ──────────────────────────────────
    const hasText = !!dto.content?.trim();
    const hasImages = !!dto.images?.length;

    if (!hasText && !hasImages)
      throw new BadRequestException('question.CONTENT_OR_IMAGE_REQUIRED');

    const user = await this.userModel
      .findOne({ authAccountId: new Types.ObjectId(authAccountId) })
      .lean();
    if (!user) throw new NotFoundException('user.NOT_FOUND');

    const specializationIds =
      (await this.specializationsService.validateAndGetIds(
        dto.specializationId,
      )) as any;

    return this.repo.create({
      userId: (user as any)._id,
      content: dto.content ?? '',
      images: dto.images ?? [],
      specializationId: specializationIds,
      hasText,
      hasImages,
      status: QuestionStatus.PENDING,
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // MODERATE — approve or reject (ADMIN only)
  // ══════════════════════════════════════════════════════════════════════════

  async moderateQuestion(
    questionId: string,
    dto: ModerateQuestionDto,
  ): Promise<ModerationResult> {
    if (!Types.ObjectId.isValid(questionId))
      throw new BadRequestException('question.INVALID_ID');

    const question = await this.questionModel
      .findById(new Types.ObjectId(questionId))
      .lean();
    if (!question) throw new NotFoundException('question.NOT_FOUND');

    if ((question as any).status !== QuestionStatus.PENDING)
      throw new BadRequestException('question.ALREADY_MODERATED');

    if (dto.action === ModerationAction.REJECT && !dto.reason?.trim())
      throw new BadRequestException('question.REJECTION_REASON_REQUIRED');

    const newStatus =
      dto.action === ModerationAction.APPROVE
        ? QuestionStatus.APPROVED
        : QuestionStatus.REJECTED;

    const moderatedAt = new Date();
    const updatePayload: Record<string, any> = {
      status: newStatus,
      moderatedAt,
    };
    if (dto.reason?.trim()) updatePayload.rejectionReason = dto.reason.trim();

    await this.questionModel.updateOne(
      { _id: (question as any)._id },
      { $set: updatePayload },
    );

    return {
      questionId: (question as any)._id,
      status: newStatus as QuestionStatus.APPROVED | QuestionStatus.REJECTED,
      reason: dto.reason?.trim(),
      moderatedAt,
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // GET SINGLE QUESTION BY ID
  // ══════════════════════════════════════════════════════════════════════════

  async getQuestionById(
    questionId: string,
    authAccountId: string,
    role: UserRole,
  ): Promise<MappedQuestion> {
    if (!Types.ObjectId.isValid(questionId))
      throw new BadRequestException('question.INVALID_ID');

    const match = visibleMatch({ _id: new Types.ObjectId(questionId) });

    let result;
    if (
      role === UserRole.DOCTOR ||
      role === UserRole.HOSPITAL ||
      role === UserRole.CENTER
    ) {
      const responderId = await this.resolveResponderId(role, authAccountId);
      result = await this.repo.findDoctorQuestionsWithAnswers(
        match,
        0,
        1,
        responderId,
        false,
      );
    } else {
      result = await this.repo.findQuestionsWithAnswers(match, 0, 1);
    }

    if (!result.questions.length)
      throw new NotFoundException('question.NOT_FOUND');
    return this.mapQuestion(result.questions[0]);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // GET QUESTIONS — general feed
  // ══════════════════════════════════════════════════════════════════════════

  async getQuestions(
    authAccountId: string,
    filter: 'allQuestions' | 'answered' | 'pending' | 'public' = 'allQuestions',
    publicSpecializationId?: string,
    privateSpecializationIds?: string[],
    page = 1,
    limit = 10,
  ): Promise<QuestionPageResult> {
    try {
      const match: Record<string, any> = { status: { $in: VISIBLE_STATUSES } };

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
      console.error('[QuestionsService.getQuestions]', error);
      throw new InternalServerErrorException('common.ERROR');
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // GET DOCTOR QUESTIONS
  // ══════════════════════════════════════════════════════════════════════════

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
    const answeredQuestionIds =
      await this.getAnsweredQuestionIds(doctorProfileId);

    if (filter === 'myAnswers' && !answeredQuestionIds.length) {
      return { questions: [], total: 0, page, limit, totalPages: 0 };
    }

    const match = await this.buildDoctorMatch(
      filter,
      answeredQuestionIds,
      doctor,
    );
    const skip = (page - 1) * limit;
    const showOnlyMine = filter === 'myAnswers';

    const { questions, total, totalPages } =
      await this.repo.findDoctorQuestionsWithAnswers(
        match,
        skip,
        limit,
        doctorProfileId,
        showOnlyMine,
      );

    return {
      questions: questions.map((q) => this.mapDoctorQuestion(q)),
      total,
      page,
      limit,
      totalPages,
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ANSWER QUESTION
  // ══════════════════════════════════════════════════════════════════════════

  async answerQuestion(params: AnswerQuestionParams): Promise<Answer> {
    const { questionId, responderType, responderId, content } = params;

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

    const status = (question as any).status as QuestionStatus;

    if (!VISIBLE_STATUSES.includes(status)) {
      throw new ForbiddenException(
        status === QuestionStatus.PENDING
          ? 'question.NOT_YET_APPROVED'
          : 'question.NOT_AVAILABLE',
      );
    }

    const alreadyAnswered = await this.answerModel.exists({
      questionId: new Types.ObjectId(questionId),
      responderId: realResponderId,
    });
    if (alreadyAnswered)
      throw new BadRequestException('question.ALREADY_ANSWERED_BY_YOU');

    const answer = await this.answerModel.create({
      questionId: new Types.ObjectId(questionId),
      responderType,
      responderId: realResponderId,
      content,
    });

    if (status !== QuestionStatus.ANSWERED) {
      await this.questionModel.updateOne(
        { _id: (question as any)._id },
        { $set: { status: QuestionStatus.ANSWERED } },
      );
    }

    return answer;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // STATISTICS
  // ══════════════════════════════════════════════════════════════════════════

  async getStats(
    authAccountId: string,
    role: UserRole,
  ): Promise<QuestionStats> {
    try {
      let responderId: Types.ObjectId | null = null;
      if (
        role === UserRole.DOCTOR ||
        role === UserRole.HOSPITAL ||
        role === UserRole.CENTER
      ) {
        responderId = await this.resolveResponderId(role, authAccountId);
      }

      const [statusStats, specStats, acceptedByMe] = await Promise.all([
        this.repo.getStatsByStatus(),
        this.repo.getStatsBySpecialization(),
        responderId
          ? this.answerModel.countDocuments({ responderId })
          : Promise.resolve(0),
      ]);

      const { total, answered, pending, rejected, approved, deleted } =
        statusStats;

      const bySpecialization: SpecializationStat[] = specStats.map((s) => ({
        specializationId: s.specializationId,
        name: s.name,
        total: s.total,
        approved: s.approved,
        answered: s.answered,
        pending: s.pending,
        rejected: s.rejected,
        approvedPercent: pct(s.approved, s.total),
        answeredPercent: pct(s.answered, s.total),
        pendingPercent: pct(s.pending, s.total),
        rejectedPercent: pct(s.rejected, s.total),
      }));

      return {
        total,
        approved,
        answered,
        pending,
        rejected,
        deleted,
        acceptedByMe: acceptedByMe as number,
        approvedPercent: pct(approved, total),
        answeredPercent: pct(answered, total),
        pendingPercent: pct(pending, total),
        rejectedPercent: pct(rejected, total),
        acceptedByMePercent: pct(acceptedByMe as number, total),
        bySpecialization,
      };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException ||
        error instanceof ForbiddenException
      )
        throw error;
      console.error('[QuestionsService.getStats]', error);
      throw new InternalServerErrorException('common.ERROR');
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // DELETE QUESTION (owner only)
  // ══════════════════════════════════════════════════════════════════════════

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

    await this.answerModel.deleteMany({
      questionId: new Types.ObjectId(questionId),
    });
    return this.repo.delete(questionId);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ══════════════════════════════════════════════════════════════════════════

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
    if (!Types.ObjectId.isValid(authAccountId))
      throw new BadRequestException('user.INVALID_ID');

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

  private async buildDoctorMatch(
    filter: 'all' | 'specialization' | 'myAnswers',
    answeredIds: Types.ObjectId[],
    doctor: any,
  ): Promise<Record<string, any>> {
    if (filter === 'myAnswers') return { _id: { $in: answeredIds } };

    const match: Record<string, any> = { status: { $in: VISIBLE_STATUSES } };

    if (filter === 'specialization' && doctor.publicSpecialization) {
      const privateSpecIds = await this.specializationsService
        .getPrivateIdsByPublicName(doctor.publicSpecialization)
        .catch(() => [] as Types.ObjectId[]);

      if (privateSpecIds.length)
        match.specializationId = { $in: privateSpecIds };
    }

    if (answeredIds.length) match._id = { $nin: answeredIds };

    return match;
  }

  // ── Mappers ───────────────────────────────────────────────────────────────

  private mapQuestion(q: any): MappedQuestion {
    return {
      _id: q._id,
      content: q.content,
      images: q.images?.[0] ?? null,
      hasText: q.hasText ?? !!q.content,
      hasImages: q.hasImages ?? !!q.images?.length,
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
        name: q.asker?.name ?? q.asker?.username ?? 'Unknown',
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
        : (a.responder?.username ?? a.responder?.name ?? 'Unknown'),
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
