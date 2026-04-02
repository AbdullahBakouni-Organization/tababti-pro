import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import { QuestionsRepository } from './questions.repository';
import { Question } from '@app/common/database/schemas/question.schema';
import { QuestionStatus } from '@app/common/database/schemas/common.enums';

describe('QuestionsRepository', () => {
  let repo: QuestionsRepository;
  const validId = new Types.ObjectId();

  const mockQuestionModel = {
    create: jest.fn(),
    findById: jest.fn(),
    findByIdAndDelete: jest.fn(),
    aggregate: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuestionsRepository,
        { provide: getModelToken(Question.name), useValue: mockQuestionModel },
      ],
    }).compile();

    repo = module.get<QuestionsRepository>(QuestionsRepository);
  });

  it('should be defined', () => {
    expect(repo).toBeDefined();
  });

  describe('create()', () => {
    it('creates a question', async () => {
      const data = { content: 'Test question', status: QuestionStatus.PENDING };
      mockQuestionModel.create.mockResolvedValue({ _id: validId, ...data });

      const result = await repo.create(data);
      expect(result).toHaveProperty('_id');
      expect(mockQuestionModel.create).toHaveBeenCalledWith(data);
    });
  });

  describe('findById()', () => {
    it('throws BadRequestException for invalid id', async () => {
      await expect(repo.findById('bad')).rejects.toThrow(BadRequestException);
    });

    it('returns question for valid id', async () => {
      const mockQ = { _id: validId, content: 'q' };
      mockQuestionModel.findById.mockReturnValue({
        lean: jest.fn().mockResolvedValue(mockQ),
      });

      const result = await repo.findById(validId.toString());
      expect(result).toEqual(mockQ);
    });
  });

  describe('delete()', () => {
    it('throws BadRequestException for invalid id', async () => {
      await expect(repo.delete('bad')).rejects.toThrow(BadRequestException);
    });

    it('calls findByIdAndDelete and returns result', async () => {
      const mockQ = { _id: validId };
      mockQuestionModel.findByIdAndDelete.mockReturnValue({
        lean: jest.fn().mockResolvedValue(mockQ),
      });

      const result = await repo.delete(validId.toString());
      expect(result).toEqual(mockQ);
    });
  });

  describe('getStatsByStatus()', () => {
    it('returns zero stats when no data', async () => {
      mockQuestionModel.aggregate.mockResolvedValue([]);

      const result = await repo.getStatsByStatus();
      expect(result.total).toBe(0);
      expect(result.approved).toBe(0);
    });

    it('aggregates status counts correctly', async () => {
      mockQuestionModel.aggregate.mockResolvedValue([
        { _id: QuestionStatus.APPROVED, count: 5 },
        { _id: QuestionStatus.ANSWERED, count: 3 },
        { _id: QuestionStatus.PENDING, count: 2 },
      ]);

      const result = await repo.getStatsByStatus();
      expect(result.approved).toBe(5);
      expect(result.answered).toBe(3);
      expect(result.pending).toBe(2);
      expect(result.total).toBe(10);
    });
  });
});
