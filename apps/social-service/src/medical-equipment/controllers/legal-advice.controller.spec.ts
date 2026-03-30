import { Test, TestingModule } from '@nestjs/testing';
import { LegalAdviceController } from './legal-advice.controller';
import { LegalAdviceService } from '../services/legal-advice.service';
import {
  UserRole,
  EntityRequestStatus,
  LegalAdviceCategory,
} from '@app/common/database/schemas/common.enums';

describe('LegalAdviceController', () => {
  let controller: LegalAdviceController;

  const mockRequest = {
    id: 'req-1',
    requesterType: UserRole.DOCTOR,
    requesterId: 'doc-1',
    legalAdviceType: LegalAdviceCategory.licensing,
    status: EntityRequestStatus.PENDING,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockService = {
    createRequest: jest.fn(),
    getMyRequests: jest.fn(),
    getRequest: jest.fn(),
    updateRequestStatus: jest.fn(),
    deleteRequest: jest.fn(),
    getAllRequests: jest.fn(),
    getStatistics: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [LegalAdviceController],
      providers: [{ provide: LegalAdviceService, useValue: mockService }],
    }).compile();

    controller = module.get<LegalAdviceController>(LegalAdviceController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('createRequest()', () => {
    it('delegates to service and wraps in ApiResponse', async () => {
      mockService.createRequest.mockResolvedValue(mockRequest);

      const result = await controller.createRequest(
        UserRole.DOCTOR,
        'doc-1',
        { legalAdviceType: LegalAdviceCategory.licensing } as any,
        'en',
      );

      expect(mockService.createRequest).toHaveBeenCalledWith(
        UserRole.DOCTOR,
        'doc-1',
        { legalAdviceType: LegalAdviceCategory.licensing },
      );
      expect(result).toHaveProperty('data');
    });
  });

  describe('getMyRequests()', () => {
    it('delegates to service and wraps in ApiResponse', async () => {
      const paged = { requests: [mockRequest], total: 1, page: 1, limit: 10, totalPages: 1 };
      mockService.getMyRequests.mockResolvedValue(paged);

      const result = await controller.getMyRequests(
        UserRole.DOCTOR,
        'doc-1',
        undefined,
        1,
        10,
        'en',
      );

      expect(result).toHaveProperty('data');
    });
  });

  describe('getRequest()', () => {
    it('delegates to service and wraps in ApiResponse', async () => {
      mockService.getRequest.mockResolvedValue(mockRequest);

      const result = await controller.getRequest(
        'req-1',
        UserRole.DOCTOR,
        'doc-1',
        'en',
      );

      expect(mockService.getRequest).toHaveBeenCalledWith(
        'req-1',
        UserRole.DOCTOR,
        'doc-1',
      );
      expect(result).toHaveProperty('data');
    });
  });

  describe('updateRequestStatus()', () => {
    it('delegates to service and wraps in ApiResponse', async () => {
      mockService.updateRequestStatus.mockResolvedValue({
        ...mockRequest,
        status: EntityRequestStatus.UNDER_REVIEW,
      });

      const result = await controller.updateRequestStatus(
        'req-1',
        { status: EntityRequestStatus.UNDER_REVIEW } as any,
        'en',
      );

      expect(result).toHaveProperty('data');
    });
  });

  describe('getAllRequests()', () => {
    it('delegates to service with filters and wraps in ApiResponse', async () => {
      const paged = { requests: [], total: 0, page: 1, limit: 10, totalPages: 0 };
      mockService.getAllRequests.mockResolvedValue(paged);

      const result = await controller.getAllRequests(
        UserRole.DOCTOR,
        LegalAdviceCategory.licensing,
        EntityRequestStatus.PENDING,
        1,
        10,
        'en',
      );

      expect(mockService.getAllRequests).toHaveBeenCalledWith(
        {
          requesterType: UserRole.DOCTOR,
          legalAdviceType: LegalAdviceCategory.licensing,
          status: EntityRequestStatus.PENDING,
        },
        1,
        10,
      );
      expect(result).toHaveProperty('data');
    });
  });

  describe('getStatistics()', () => {
    it('delegates to service and wraps in ApiResponse', async () => {
      mockService.getStatistics.mockResolvedValue({ total: 10 });

      const result = await controller.getStatistics('en');
      expect(result).toHaveProperty('data');
    });
  });
});
