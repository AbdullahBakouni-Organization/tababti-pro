import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { AdminLegalAdviceController } from './admin-legal-advice.controller';
import { LegalAdviceService } from '../services/legal-advice.service';
import {
  UserRole,
  EntityRequestStatus,
  LegalAdviceCategory,
} from '@app/common/database/schemas/common.enums';

describe('AdminLegalAdviceController', () => {
  let controller: AdminLegalAdviceController;

  const mockRequest = {
    id: 'req-1',
    requesterType: UserRole.DOCTOR,
    requesterId: 'doc-1',
    legalAdviceType: LegalAdviceCategory.licensing,
    status: EntityRequestStatus.PENDING,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockStats = {
    totalRequests: 10,
    pendingRequests: 5,
    underReviewRequests: 2,
    contactedRequests: 1,
    completedRequests: 2,
    cancelledRequests: 0,
    byCategory: {},
    byRequesterType: {},
  };

  const mockService = {
    getStatistics: jest.fn(),
    getPendingRequestsCount: jest.fn(),
    getAllRequests: jest.fn(),
    getRequest: jest.fn(),
    updateRequestStatus: jest.fn(),
    markAsContacted: jest.fn(),
    reassignRequest: jest.fn(),
    bulkUpdateStatus: jest.fn(),
    deleteRequest: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminLegalAdviceController],
      providers: [{ provide: LegalAdviceService, useValue: mockService }],
    }).compile();

    controller = module.get<AdminLegalAdviceController>(
      AdminLegalAdviceController,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getDashboard()', () => {
    it('returns dashboard stats and summary cards', async () => {
      mockService.getStatistics.mockResolvedValue(mockStats);
      mockService.getPendingRequestsCount.mockResolvedValue(5);

      const result = await controller.getDashboard('en');

      expect(result).toHaveProperty('data');
      expect(result.data).toHaveProperty('statistics');
      expect(result.data).toHaveProperty('summaryCards');
    });
  });

  describe('getAllRequests()', () => {
    it('delegates to service and returns wrapped result', async () => {
      const paged = {
        requests: [mockRequest],
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      };
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

  describe('getRequestsByStatus()', () => {
    it('throws BadRequestException for invalid status', async () => {
      await expect(
        controller.getRequestsByStatus('INVALID_STATUS' as any, 1, 10, 'en'),
      ).rejects.toThrow(BadRequestException);
    });

    it('returns requests filtered by status', async () => {
      const paged = {
        requests: [],
        total: 0,
        page: 1,
        limit: 10,
        totalPages: 0,
      };
      mockService.getAllRequests.mockResolvedValue(paged);

      const result = await controller.getRequestsByStatus(
        EntityRequestStatus.PENDING,
        1,
        10,
        'en',
      );
      expect(result).toHaveProperty('data');
    });
  });

  describe('getMyQueue()', () => {
    it('returns admin queue', async () => {
      const paged = {
        requests: [],
        total: 0,
        page: 1,
        limit: 10,
        totalPages: 0,
      };
      mockService.getAllRequests.mockResolvedValue(paged);

      const result = await controller.getMyQueue('admin-1', 1, 10, 'en');
      expect(result).toHaveProperty('data');
    });
  });

  describe('getRequest()', () => {
    it('returns single request with admin access', async () => {
      mockService.getRequest.mockResolvedValue(mockRequest);

      const result = await controller.getRequest(
        'req-1',
        UserRole.ADMIN,
        'admin-1',
        'en',
      );

      expect(mockService.getRequest).toHaveBeenCalledWith(
        'req-1',
        UserRole.ADMIN,
        'admin-1',
        true,
      );
      expect(result).toHaveProperty('data');
    });
  });

  describe('updateStatus()', () => {
    it('throws BadRequestException when status is missing', async () => {
      await expect(
        controller.updateStatus(
          'req-1',
          { status: undefined as any },
          'admin-1',
          'en',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('updates request status', async () => {
      mockService.updateRequestStatus.mockResolvedValue({
        ...mockRequest,
        status: EntityRequestStatus.UNDER_REVIEW,
      });

      const result = await controller.updateStatus(
        'req-1',
        { status: EntityRequestStatus.UNDER_REVIEW },
        'admin-1',
        'en',
      );
      expect(result).toHaveProperty('data');
    });
  });

  describe('markAsContacted()', () => {
    it('marks request as contacted', async () => {
      mockService.markAsContacted.mockResolvedValue({
        ...mockRequest,
        status: EntityRequestStatus.CONTACTED,
      });

      const result = await controller.markAsContacted(
        'req-1',
        { contactNotes: 'Called client' } as any,
        'admin-1',
        'en',
      );
      expect(result).toHaveProperty('data');
    });
  });

  describe('getStatistics()', () => {
    it('returns statistics', async () => {
      mockService.getStatistics.mockResolvedValue(mockStats);

      const result = await controller.getStatistics('en');
      expect(result).toHaveProperty('data');
    });
  });
});
