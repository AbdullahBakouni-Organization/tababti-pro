import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { AdminMedicalEquipmentController } from './admin-medical-equipment.controller';
import { MedicalEquipmentService } from '../services/medical.equipment.service';
import {
  UserRole,
  EntityRequestStatus,
  Machines,
} from '@app/common/database/schemas/common.enums';
import { Types } from 'mongoose';

describe('AdminMedicalEquipmentController', () => {
  let controller: AdminMedicalEquipmentController;

  const requestId = new Types.ObjectId().toString();
  const mockRequest = {
    id: requestId,
    requesterType: UserRole.DOCTOR,
    requesterId: 'doc-1',
    equipmentType: Machines.MRIMachine,
    quantity: 1,
    status: EntityRequestStatus.PENDING,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockStats = {
    totalRequests: 5,
    pendingRequests: 3,
    underReviewRequests: 1,
    contactedRequests: 0,
    completedRequests: 1,
    cancelledRequests: 0,
    byEquipmentType: {},
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
      controllers: [AdminMedicalEquipmentController],
      providers: [{ provide: MedicalEquipmentService, useValue: mockService }],
    }).compile();

    controller = module.get<AdminMedicalEquipmentController>(
      AdminMedicalEquipmentController,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getDashboard()', () => {
    it('returns dashboard stats with summary cards', async () => {
      mockService.getStatistics.mockResolvedValue(mockStats);
      mockService.getPendingRequestsCount.mockResolvedValue(3);

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
        Machines.MRIMachine,
        EntityRequestStatus.PENDING,
        1,
        10,
        'en',
      );

      expect(mockService.getAllRequests).toHaveBeenCalledWith(
        {
          requesterType: UserRole.DOCTOR,
          equipmentType: Machines.MRIMachine,
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
        controller.getRequestsByStatus('INVALID' as any, 1, 10, 'en'),
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

  describe('getRequest()', () => {
    it('returns single request with admin access', async () => {
      mockService.getRequest.mockResolvedValue(mockRequest);

      const result = await controller.getRequest(
        requestId,
        UserRole.ADMIN,
        'admin-1',
        'en',
      );

      expect(mockService.getRequest).toHaveBeenCalledWith(
        requestId,
        UserRole.ADMIN,
        'admin-1',
      );
      expect(result).toHaveProperty('data');
    });
  });

  describe('updateStatus()', () => {
    it('throws BadRequestException when status is missing', async () => {
      await expect(
        controller.updateStatus(
          requestId,
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
        requestId,
        { status: EntityRequestStatus.UNDER_REVIEW },
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
