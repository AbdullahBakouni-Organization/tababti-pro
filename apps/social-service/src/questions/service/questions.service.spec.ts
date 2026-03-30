import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { QuestionsService } from './questions.service';
import { QuestionsRepository } from '../repository/questions.repository';
import { SpecializationsService } from '../../specializations/specializations.service';
import { Question } from '@app/common/database/schemas/question.schema';
import { Answer } from '@app/common/database/schemas/answer.schema';
import { User } from '@app/common/database/schemas/user.schema';
import { Doctor } from '@app/common/database/schemas/doctor.schema';
import { Hospital } from '@app/common/database/schemas/hospital.schema';
import { Center } from '@app/common/database/schemas/center.schema';
import { CacheService } from '@app/common/cache/cache.service';
import { QuestionStatus, UserRole } from '@app/common/database/schemas/common.enums';

jest.mock('@app/common/utils/cache-invalidation.util', () => ({
  invalidateQuestionsCaches: jest.fn().mockResolvedValue(undefined),
}));

describe('QuestionsService', () => {
  let service: QuestionsService;

  const authId = new Types.ObjectId();
  const userId = new Types.ObjectId();
  const doctorId = new Types.ObjectId();
  const questionId = new Types.ObjectId();

  const mockUser = { _id: userId, authAccountId: authId };
  const mockDoctor = { _id: doctorId, authAccountId: authId, publicSpecialization: 'general' };
  const mockQuestion = {
    _id: questionId,
    userId,
    content: 'Test question',
    status: QuestionStatus.APPROVED,
  };

  const mockRepo = {
    create: jest.fn(),
    findById: jest.fn(),
    findQuestionsWithAnswers: jest.fn(),
    findDoctorQuestionsWithAnswers: jest.fn(),
    delete: jest.fn(),
    getStatsByStatus: jest.fn(),
    getStatsBySpecialization: jest.fn(),
  };

  const mockSpecializationsService = {
    validateAndGetIds: jest.fn().mockResolvedValue([]),
    getPrivateIdsByPublicName: jest.fn().mockResolvedValue([]),
  };

  const mockUserModel = {
    findOne: jest.fn(),
    exists: jest.fn(),
  };
  const mockAnswerModel = {
    create: jest.fn(),
    exists: jest.fn(),
    find: jest.fn(),
    countDocuments: jest.fn(),
    deleteMany: jest.fn(),
  };
  const mockQuestionModel = {
    findById: jest.fn(),
    updateOne: jest.fn(),
  };
  const mockDoctorModel = {
    findOne: jest.fn(),
  };
  const mockHospitalModel = {
    findOne: jest.fn(),
  };
  const mockCenterModel = {
    findOne: jest.fn(),
  };
  const mockCacheService = {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    del: jest.fn(),
    invalidate: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuestionsService,
        { provide: QuestionsRepository, useValue: mockRepo },
        { provide: SpecializationsService, useValue: mockSpecializationsService },
        { provide: getModelToken(User.name), useValue: mockUserModel },
        { provide: getModelToken(Answer.name), useValue: mockAnswerModel },
        { provide: getModelToken(Question.name), useValue: mockQuestionModel },
        { provide: getModelToken(Doctor.name), useValue: mockDoctorModel },
        { provide: getModelToken(Hospital.name), useValue: mockHospitalModel },
        { provide: getModelToken(Center.name), useValue: mockCenterModel },
        { provide: CacheService, useValue: mockCacheService },
      ],
    }).compile();

    service = module.get<QuestionsService>(QuestionsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─── create ────────────────────────────────────────────────────────────────

  describe('create()', () => {
    it('throws BadRequestException for invalid authAccountId', async () => {
      await expect(service.create({ content: 'q' } as any, 'bad-id')).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when user not found', async () => {
      mockUserModel.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
      await expect(service.create({ content: 'q' } as any, authId.toString())).rejects.toThrow(NotFoundException);
    });

    it('creates question successfully', async () => {
      mockUserModel.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(mockUser) });
      mockRepo.create.mockResolvedValue({ _id: questionId, content: 'q' });

      const result = await service.create({ content: 'q', specializationId: [] } as any, authId.toString());
      expect(result).toHaveProperty('_id');
      expect(mockRepo.create).toHaveBeenCalled();
    });
  });

  // ─── moderateQuestion ──────────────────────────────────────────────────────

  describe('moderateQuestion()', () => {
    it('throws BadRequestException for invalid questionId', async () => {
      await expect(service.moderateQuestion('bad', { action: 'approve' } as any)).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when question not found', async () => {
      mockQuestionModel.findById.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
      await expect(service.moderateQuestion(questionId.toString(), { action: 'approve' } as any)).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when question is not pending', async () => {
      mockQuestionModel.findById.mockReturnValue({
        lean: jest.fn().mockResolvedValue({ ...mockQuestion, status: QuestionStatus.APPROVED }),
      });
      await expect(service.moderateQuestion(questionId.toString(), { action: 'approve' } as any)).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when rejecting without reason', async () => {
      mockQuestionModel.findById.mockReturnValue({
        lean: jest.fn().mockResolvedValue({ ...mockQuestion, status: QuestionStatus.PENDING }),
      });
      await expect(
        service.moderateQuestion(questionId.toString(), { action: 'reject', reason: '' } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('approves a pending question', async () => {
      mockQuestionModel.findById.mockReturnValue({
        lean: jest.fn().mockResolvedValue({ _id: questionId, status: QuestionStatus.PENDING }),
      });
      mockQuestionModel.updateOne.mockResolvedValue({ modifiedCount: 1 });

      const result = await service.moderateQuestion(questionId.toString(), { action: 'approve' } as any);
      expect(result.status).toBe(QuestionStatus.APPROVED);
    });
  });

  // ─── getQuestions ──────────────────────────────────────────────────────────

  describe('getQuestions()', () => {
    it('returns cached result', async () => {
      const cached = { questions: { data: [], total: 0 }, meta: {} };
      mockCacheService.get.mockResolvedValue(cached);

      const result = await service.getQuestions('main');
      expect(result).toEqual(cached);
    });

    it('fetches and caches questions from repo', async () => {
      mockCacheService.get.mockResolvedValue(null);
      mockRepo.findQuestionsWithAnswers.mockResolvedValue({
        questions: [{ _id: questionId, content: 'q', status: QuestionStatus.APPROVED, answers: [] }],
        total: 1,
        totalPages: 1,
      });

      const result = await service.getQuestions('main', [], 1, 10);
      expect(result.questions.data).toHaveLength(1);
      expect(mockCacheService.set).toHaveBeenCalled();
    });
  });

  // ─── answerQuestion ────────────────────────────────────────────────────────

  describe('answerQuestion()', () => {
    it('throws BadRequestException for invalid questionId', async () => {
      await expect(service.answerQuestion({
        questionId: 'bad',
        responderType: UserRole.DOCTOR,
        responderId: authId.toString(),
        content: 'ans',
      })).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when responderType is USER', async () => {
      await expect(service.answerQuestion({
        questionId: questionId.toString(),
        responderType: UserRole.USER,
        responderId: authId.toString(),
        content: 'ans',
      })).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when question not found', async () => {
      mockDoctorModel.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(mockDoctor) });
      mockRepo.findById.mockResolvedValue(null);

      await expect(service.answerQuestion({
        questionId: questionId.toString(),
        responderType: UserRole.DOCTOR,
        responderId: authId.toString(),
        content: 'ans',
      })).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException for pending question', async () => {
      mockDoctorModel.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(mockDoctor) });
      mockRepo.findById.mockResolvedValue({ ...mockQuestion, status: QuestionStatus.PENDING });

      await expect(service.answerQuestion({
        questionId: questionId.toString(),
        responderType: UserRole.DOCTOR,
        responderId: authId.toString(),
        content: 'ans',
      })).rejects.toThrow(ForbiddenException);
    });

    it('creates answer successfully', async () => {
      mockDoctorModel.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(mockDoctor) });
      mockRepo.findById.mockResolvedValue({ _id: questionId, status: QuestionStatus.APPROVED });
      mockAnswerModel.exists.mockResolvedValue(null);
      mockAnswerModel.create.mockResolvedValue({ _id: new Types.ObjectId(), content: 'ans' });
      mockQuestionModel.updateOne.mockResolvedValue({ modifiedCount: 1 });

      const result = await service.answerQuestion({
        questionId: questionId.toString(),
        responderType: UserRole.DOCTOR,
        responderId: authId.toString(),
        content: 'ans',
      });
      expect(result).toHaveProperty('content', 'ans');
    });
  });

  // ─── deleteQuestion ────────────────────────────────────────────────────────

  describe('deleteQuestion()', () => {
    it('throws BadRequestException for invalid questionId', async () => {
      await expect(service.deleteQuestion('bad', authId.toString())).rejects.toThrow(BadRequestException);
    });

    it('throws ForbiddenException when not owner', async () => {
      const otherId = new Types.ObjectId();
      mockUserModel.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue({ _id: otherId }) });
      mockRepo.findById.mockResolvedValue({ ...mockQuestion, userId });

      await expect(service.deleteQuestion(questionId.toString(), authId.toString())).rejects.toThrow(ForbiddenException);
    });

    it('deletes question when owner', async () => {
      mockUserModel.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue({ _id: userId }) });
      mockRepo.findById.mockResolvedValue({ _id: questionId, userId });
      mockAnswerModel.deleteMany.mockResolvedValue({ deletedCount: 0 });
      mockRepo.delete.mockResolvedValue({ _id: questionId });

      const result = await service.deleteQuestion(questionId.toString(), authId.toString());
      expect(result).toHaveProperty('_id');
    });
  });
});
