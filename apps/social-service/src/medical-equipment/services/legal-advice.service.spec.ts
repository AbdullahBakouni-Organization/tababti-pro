import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { LegalAdviceService } from './legal-advice.service';
import { LegalAdviceRepository } from '../repositories/legal-advice.repository';
import {
  UserRole,
  EntityRequestStatus,
  LegalAdviceCategory,
} from '@app/common/database/schemas/common.enums';

describe('LegalAdviceService', () => {
  let service: LegalAdviceService;

  const requesterId = new Types.ObjectId().toString();
  const requestId = new Types.ObjectId().toString();

  const mockRequest = {
    _id: { toString: () => requestId },
    requesterType: UserRole.DOCTOR,
    requesterId: { toString: () => requesterId },
    legalAdviceType: LegalAdviceCategory.licensing,
    status: EntityRequestStatus.PENDING,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockRepo = {
    createRequest: jest.fn(),
    findById: jest.fn(),
    findByRequester: jest.fn(),
    findAll: jest.fn(),
    updateStatus: jest.fn(),
    updateRequestFields: jest.fn(),
    deleteRequest: jest.fn(),
    getStatistics: jest.fn(),
    countByStatus: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LegalAdviceService,
        { provide: LegalAdviceRepository, useValue: mockRepo },
      ],
    }).compile();

    service = module.get<LegalAdviceService>(LegalAdviceService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createRequest()', () => {
    it('throws BadRequestException for invalid requester type', async () => {
      await expect(
        service.createRequest(
          UserRole.USER,
          requesterId,
          { legalAdviceType: LegalAdviceCategory.licensing } as any,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates request for valid doctor requester', async () => {
      mockRepo.createRequest.mockResolvedValue(mockRequest);

      const result = await service.createRequest(
        UserRole.DOCTOR,
        requesterId,
        { legalAdviceType: LegalAdviceCategory.licensing } as any,
      );

      expect(mockRepo.createRequest).toHaveBeenCalledWith(
        UserRole.DOCTOR,
        requesterId,
        LegalAdviceCategory.licensing,
      );
      expect(result).toHaveProperty('id');
    });

    it('creates request for HOSPITAL requester', async () => {
      mockRepo.createRequest.mockResolvedValue({
        ...mockRequest,
        requesterType: UserRole.HOSPITAL,
        requesterId: { toString: () => requesterId },
      });

      await expect(
        service.createRequest(
          UserRole.HOSPITAL,
          requesterId,
          { legalAdviceType: LegalAdviceCategory.licensing } as any,
        ),
      ).resolves.not.toThrow();
    });
  });

  describe('getMyRequests()', () => {
    it('returns paginated requests', async () => {
      mockRepo.findByRequester.mockResolvedValue([mockRequest, mockRequest]);

      const result = await service.getMyRequests(
        UserRole.DOCTOR,
        requesterId,
        undefined,
        1,
        10,
      );

      expect(result.total).toBe(2);
      expect(result.requests).toHaveLength(2);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(10);
    });

    it('returns only first page when paginated', async () => {
      const requests = Array(15).fill(mockRequest);
      mockRepo.findByRequester.mockResolvedValue(requests);

      const result = await service.getMyRequests(
        UserRole.DOCTOR,
        requesterId,
        undefined,
        1,
        10,
      );

      expect(result.total).toBe(15);
      expect(result.requests).toHaveLength(10);
      expect(result.totalPages).toBe(2);
    });
  });

  describe('getRequest()', () => {
    it('returns request when owner matches', async () => {
      mockRepo.findById.mockResolvedValue(mockRequest);

      const result = await service.getRequest(
        requestId,
        UserRole.DOCTOR,
        requesterId,
      );
      expect(result).toHaveProperty('id');
    });

    it('throws ForbiddenException when non-owner tries to access', async () => {
      const otherId = new Types.ObjectId().toString();
      mockRepo.findById.mockResolvedValue(mockRequest);

      await expect(
        service.getRequest(requestId, UserRole.DOCTOR, otherId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows admin to access any request', async () => {
      const adminId = new Types.ObjectId().toString();
      mockRepo.findById.mockResolvedValue(mockRequest);

      await expect(
        service.getRequest(requestId, UserRole.ADMIN, adminId, true),
      ).resolves.not.toThrow();
    });
  });

  describe('updateRequestStatus()', () => {
    it('throws BadRequestException for invalid status transition', async () => {
      const completedRequest = {
        ...mockRequest,
        status: EntityRequestStatus.COMPLETED,
      };
      mockRepo.findById.mockResolvedValue(completedRequest);

      await expect(
        service.updateRequestStatus(requestId, {
          status: EntityRequestStatus.PENDING,
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('updates status for valid transition', async () => {
      mockRepo.findById.mockResolvedValue(mockRequest);
      mockRepo.updateStatus.mockResolvedValue({
        ...mockRequest,
        status: EntityRequestStatus.UNDER_REVIEW,
      });

      const result = await service.updateRequestStatus(requestId, {
        status: EntityRequestStatus.UNDER_REVIEW,
      } as any);

      expect(result).toHaveProperty('id');
    });
  });

  describe('deleteRequest()', () => {
    it('throws ForbiddenException when non-owner tries to delete', async () => {
      const otherId = new Types.ObjectId().toString();
      mockRepo.findById.mockResolvedValue(mockRequest);

      await expect(
        service.deleteRequest(requestId, UserRole.DOCTOR, otherId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws BadRequestException when request is not PENDING', async () => {
      const reviewedRequest = {
        ...mockRequest,
        status: EntityRequestStatus.UNDER_REVIEW,
        requesterId: { toString: () => requesterId },
      };
      mockRepo.findById.mockResolvedValue(reviewedRequest);

      await expect(
        service.deleteRequest(requestId, UserRole.DOCTOR, requesterId),
      ).rejects.toThrow(BadRequestException);
    });

    it('deletes successfully when owner deletes PENDING request', async () => {
      mockRepo.findById.mockResolvedValue(mockRequest);
      mockRepo.deleteRequest.mockResolvedValue(true);

      await expect(
        service.deleteRequest(requestId, UserRole.DOCTOR, requesterId),
      ).resolves.not.toThrow();
    });

    it('throws NotFoundException when delete returns false', async () => {
      mockRepo.findById.mockResolvedValue(mockRequest);
      mockRepo.deleteRequest.mockResolvedValue(false);

      await expect(
        service.deleteRequest(requestId, UserRole.DOCTOR, requesterId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getAllRequests()', () => {
    it('returns paginated results from repo', async () => {
      mockRepo.findAll.mockResolvedValue({
        requests: [mockRequest],
        total: 1,
      });

      const result = await service.getAllRequests({}, 1, 10);

      expect(result.requests).toHaveLength(1);
      expect(result.total).toBe(1);
    });
  });

  describe('getStatistics()', () => {
    it('delegates to repo.getStatistics', async () => {
      const stats = { total: 10, pending: 5 };
      mockRepo.getStatistics.mockResolvedValue(stats);

      const result = await service.getStatistics();
      expect(result).toEqual(stats);
    });
  });

  describe('bulkUpdateStatus()', () => {
    it('updates successfully and counts failures', async () => {
      const id1 = new Types.ObjectId().toString();
      const id2 = new Types.ObjectId().toString();

      mockRepo.findById
        .mockResolvedValueOnce(mockRequest)
        .mockRejectedValueOnce(new NotFoundException());

      mockRepo.updateStatus.mockResolvedValue({
        ...mockRequest,
        status: EntityRequestStatus.UNDER_REVIEW,
      });

      const result = await service.bulkUpdateStatus(
        [id1, id2],
        EntityRequestStatus.UNDER_REVIEW,
      );

      expect(result.updated).toBe(1);
      expect(result.failed).toBe(1);
    });
  });
});
