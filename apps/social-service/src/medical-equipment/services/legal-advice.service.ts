import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { LegalAdviceRepository } from '../repositories/legal-advice.repository';
import {
  UserRole,
  EntityRequestStatus,
  LegalAdviceCategory,
} from '@app/common/database/schemas/common.enums';
import {
  CreateLegalAdviceRequestDto,
  UpdateLegalAdviceStatusDto,
  LegalAdviceRequestResponseDto,
  LegalAdviceRequestsPageResponseDto,
  LegalAdviceStatisticsDto,
} from '../dto/create-legal-advice-request.dto';

@Injectable()
export class LegalAdviceService {
  constructor(private readonly legalAdviceRepo: LegalAdviceRepository) {}

  // ======== Create Legal Advice Request ========
  async createRequest(
    requesterType: UserRole,
    requesterId: string,
    dto: CreateLegalAdviceRequestDto,
  ): Promise<LegalAdviceRequestResponseDto> {
    // Validate requester type
    if (
      ![UserRole.DOCTOR, UserRole.HOSPITAL, UserRole.CENTER].includes(
        requesterType,
      )
    ) {
      throw new BadRequestException('request.INVALID_REQUESTER_TYPE');
    }

    // Validate legal advice category
    if (!Object.values(LegalAdviceCategory).includes(dto.legalAdviceType)) {
      throw new BadRequestException('request.INVALID_LEGAL_ADVICE_TYPE');
    }

    const request = await this.legalAdviceRepo.createRequest(
      requesterType,
      requesterId,
      dto.legalAdviceType,
    );

    return this.mapToResponse(request);
  }

  // ======== Get My Requests (User) ========
  async getMyRequests(
    requesterType: UserRole,
    requesterId: string,
    status?: EntityRequestStatus,
    page: number = 1,
    limit: number = 10,
  ): Promise<LegalAdviceRequestsPageResponseDto> {
    try {
      const requests = await this.legalAdviceRepo.findByRequester(
        requesterType,
        requesterId,
        status,
      );

      const total = requests.length;
      const skip = (page - 1) * limit;
      const paginatedRequests = requests.slice(skip, skip + limit);
      const totalPages = Math.ceil(total / limit);

      return {
        requests: paginatedRequests.map((r) => this.mapToResponse(r)),
        total,
        page,
        limit,
        totalPages,
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('request.FETCH_FAILED');
    }
  }

  // ======== Get Single Request (User + Admin) ========
  async getRequest(
    requestId: string,
    requesterType: UserRole,
    requesterId: string,
    isAdmin: boolean = false,
  ): Promise<LegalAdviceRequestResponseDto> {
    const request = await this.legalAdviceRepo.findById(requestId);

    // Allow owner or admin to view
    if (
      !isAdmin &&
      (request.requesterType !== requesterType ||
        request.requesterId.toString() !== requesterId)
    ) {
      throw new ForbiddenException('request.FORBIDDEN');
    }

    return this.mapToResponse(request);
  }

  // ======== Update Request Status (Admin Only) ========
  async updateRequestStatus(
    requestId: string,
    dto: UpdateLegalAdviceStatusDto,
    adminId?: string,
  ): Promise<LegalAdviceRequestResponseDto> {
    // Validate status
    if (!Object.values(EntityRequestStatus).includes(dto.status)) {
      throw new BadRequestException('request.INVALID_STATUS');
    }

    const request = await this.legalAdviceRepo.findById(requestId);

    // Validate status transition
    this.validateStatusTransition(request.status, dto.status);

    const updatedRequest = await this.legalAdviceRepo.updateStatus(
      requestId,
      dto.status,
      {
        updatedBy: adminId,
        statusChangedAt: new Date(),
        reviewNotes: dto.reviewNotes,
      },
    );

    return this.mapToResponse(updatedRequest);
  }

  // ======== Delete Request (User - only PENDING) ========
  async deleteRequest(
    requestId: string,
    requesterType: UserRole,
    requesterId: string,
  ): Promise<void> {
    const request = await this.legalAdviceRepo.findById(requestId);

    // Only allow deletion by owner
    if (
      request.requesterType !== requesterType ||
      request.requesterId.toString() !== requesterId
    ) {
      throw new ForbiddenException('request.FORBIDDEN');
    }

    // Only allow deletion if pending
    if (request.status !== EntityRequestStatus.PENDING) {
      throw new BadRequestException('request.CANNOT_DELETE');
    }

    const deleted = await this.legalAdviceRepo.deleteRequest(requestId);
    if (!deleted) {
      throw new NotFoundException('request.NOT_FOUND');
    }
  }

  // ======== Get All Requests (Admin) ========
  async getAllRequests(
    filter?: {
      requesterType?: UserRole;
      legalAdviceType?: LegalAdviceCategory;
      status?: EntityRequestStatus;
    },
    page: number = 1,
    limit: number = 10,
  ): Promise<LegalAdviceRequestsPageResponseDto> {
    const skip = (page - 1) * limit;

    const { requests, total } = await this.legalAdviceRepo.findAll(
      filter,
      skip,
      limit,
    );

    const totalPages = Math.ceil(total / limit);

    return {
      requests: requests.map((r) => this.mapToResponse(r)),
      total,
      page,
      limit,
      totalPages,
    };
  }

  // ======== Get Statistics (Admin) ========
  async getStatistics(): Promise<LegalAdviceStatisticsDto> {
    return this.legalAdviceRepo.getStatistics();
  }

  // ======== Get Pending Requests Count (Admin Dashboard) ========
  async getPendingRequestsCount(): Promise<number> {
    return this.legalAdviceRepo.countByStatus(EntityRequestStatus.PENDING);
  }

  // ======== Bulk Update Status (Admin) ========
  async bulkUpdateStatus(
    requestIds: string[],
    status: EntityRequestStatus,
    adminId?: string,
  ): Promise<{ updated: number; failed: number }> {
    let updated = 0;
    let failed = 0;

    for (const requestId of requestIds) {
      try {
        const request = await this.legalAdviceRepo.findById(requestId);
        this.validateStatusTransition(request.status, status);

        await this.legalAdviceRepo.updateStatus(requestId, status, {
          updatedBy: adminId,
          statusChangedAt: new Date(),
        });
        updated++;
      } catch {
        failed++;
      }
    }

    return { updated, failed };
  }

  // ======== Mark as Contacted (Admin) ========
  async markAsContacted(
    requestId: string,
    contactNotes: string,
    adminId?: string,
  ): Promise<LegalAdviceRequestResponseDto> {
    const request = await this.legalAdviceRepo.findById(requestId);

    if (
      request.status !== EntityRequestStatus.PENDING &&
      request.status !== EntityRequestStatus.UNDER_REVIEW
    ) {
      throw new BadRequestException('request.CANNOT_CONTACT');
    }

    const updatedRequest = await this.legalAdviceRepo.updateStatus(
      requestId,
      EntityRequestStatus.CONTACTED,
      {
        updatedBy: adminId,
        statusChangedAt: new Date(),
        contactNotes,
      },
    );

    return this.mapToResponse(updatedRequest);
  }

  // ======== Reassign Request (Admin) ========
  async reassignRequest(
    requestId: string,
    assignedToAdmin: string,
    adminId?: string,
  ): Promise<LegalAdviceRequestResponseDto> {
    const updatedRequest = await this.legalAdviceRepo.updateRequestFields(
      requestId,
      {
        assignedTo: assignedToAdmin,
        assignedAt: new Date(),
        updatedBy: adminId,
      },
    );

    return this.mapToResponse(updatedRequest);
  }

  // ======== Private Helpers ========

  private validateStatusTransition(
    currentStatus: EntityRequestStatus,
    newStatus: EntityRequestStatus,
  ): void {
    // Define valid status transitions
    const validTransitions: Record<EntityRequestStatus, EntityRequestStatus[]> =
      {
        [EntityRequestStatus.PENDING]: [
          EntityRequestStatus.UNDER_REVIEW,
          EntityRequestStatus.CANCELLED,
        ],
        [EntityRequestStatus.UNDER_REVIEW]: [
          EntityRequestStatus.CONTACTED,
          EntityRequestStatus.COMPLETED,
          EntityRequestStatus.CANCELLED,
        ],
        [EntityRequestStatus.CONTACTED]: [
          EntityRequestStatus.COMPLETED,
          EntityRequestStatus.CANCELLED,
        ],
        [EntityRequestStatus.COMPLETED]: [],
        [EntityRequestStatus.CANCELLED]: [],
      };

    if (!validTransitions[currentStatus]?.includes(newStatus)) {
      throw new BadRequestException(
        `request.INVALID_STATUS_TRANSITION:${currentStatus}:${newStatus}`,
      );
    }
  }

  private mapToResponse(request: any): LegalAdviceRequestResponseDto {
    return {
      id: request._id.toString(),
      requesterType: request.requesterType,
      requesterId: request.requesterId.toString(),
      legalAdviceType: request.legalAdviceType,
      status: request.status,
      assignedTo: request.assignedTo,
      reviewNotes: request.reviewNotes,
      contactNotes: request.contactNotes,
      createdAt: request.createdAt,
      updatedAt: request.updatedAt,
      statusChangedAt: request.statusChangedAt,
    };
  }
}
