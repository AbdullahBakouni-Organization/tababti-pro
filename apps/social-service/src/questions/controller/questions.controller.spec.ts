import { Test, TestingModule } from '@nestjs/testing';
import { QuestionsController } from './questions.controller';
import { QuestionsService } from '../service/questions.service';
import { UserRole } from '@app/common/database/schemas/common.enums';

describe('QuestionsController', () => {
  let controller: QuestionsController;

  const mockService = {
    create: jest.fn(),
    moderateQuestion: jest.fn(),
    getQuestionById: jest.fn(),
    getQuestions: jest.fn(),
    getDoctorQuestions: jest.fn(),
    answerQuestion: jest.fn(),
    getStats: jest.fn(),
    deleteQuestion: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [QuestionsController],
      providers: [{ provide: QuestionsService, useValue: mockService }],
    }).compile();

    controller = module.get<QuestionsController>(QuestionsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create()', () => {
    it('delegates to service.create', async () => {
      mockService.create.mockResolvedValue({ _id: '1', content: 'q' });
      const result = await controller.create(
        { content: 'q' } as any,
        'auth-1',
        'en',
      );
      expect(mockService.create).toHaveBeenCalledWith(
        { content: 'q' },
        'auth-1',
        'en',
      );
      expect(result).toHaveProperty('data');
    });
  });

  describe('moderateQuestion()', () => {
    it('delegates to service.moderateQuestion', async () => {
      mockService.moderateQuestion.mockResolvedValue({ status: 'approved' });
      const result = await controller.moderateQuestion(
        'q-1',
        { action: 'approve' } as any,
        'en',
      );
      expect(mockService.moderateQuestion).toHaveBeenCalledWith('q-1', {
        action: 'approve',
      });
      expect(result).toHaveProperty('data');
    });
  });

  describe('getQuestions()', () => {
    it('delegates to service.getQuestions and returns result directly', async () => {
      const returnVal = { questions: { data: [] }, meta: {} };
      mockService.getQuestions.mockResolvedValue(returnVal);
      const result = await controller.getQuestions(
        'auth-1',
        { filter: 'main' } as any,
        '1',
        '10',
      );
      expect(mockService.getQuestions).toHaveBeenCalledWith(
        'main',
        undefined,
        1,
        10,
      );
      expect(result).toEqual(returnVal);
    });
  });

  describe('deleteQuestion()', () => {
    it('delegates to service.deleteQuestion', async () => {
      mockService.deleteQuestion.mockResolvedValue(null);
      const result = await controller.deleteQuestion('q-1', 'auth-1', 'en');
      expect(mockService.deleteQuestion).toHaveBeenCalledWith('q-1', 'auth-1');
      expect(result).toHaveProperty('data');
    });
  });
});
