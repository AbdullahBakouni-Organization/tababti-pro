import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { MedicalEquipmentRepository } from '../repositories/medical-equipment.repository';
import {
  UserRole,
  EntityRequestStatus,
  Machines,
} from '@app/common/database/schemas/common.enums';
import {
  CreateMedicalEquipmentRequestDto,
  UpdateMedicalEquipmentStatusDto,
  MedicalEquipmentRequestResponseDto,
  MedicalEquipmentRequestsPageResponseDto,
  MedicalEquipmentStatisticsDto,
} from '../dto/create-medical-equipment-request.dto';

@Injectable()
export class MedicalEquipmentService {
  constructor(
    private readonly medicalEquipmentRepo: MedicalEquipmentRepository,
  ) {}

  // ======== Create Equipment Request ========
  async createRequest(
    authAccountId: string,
    requesterType: UserRole,
    requesterId: string,
    dto: CreateMedicalEquipmentRequestDto,
  ): Promise<MedicalEquipmentRequestResponseDto> {
    // Validate requester type
    if (
      ![UserRole.DOCTOR, UserRole.HOSPITAL, UserRole.CENTER].includes(
        requesterType,
      )
    ) {
      throw new BadRequestException('request.INVALID_REQUESTER_TYPE');
    }

    // Validate equipment type
    if (!Object.values(Machines).includes(dto.equipmentType)) {
      throw new BadRequestException('request.INVALID_EQUIPMENT_TYPE');
    }

    // Validate quantity
    if (!dto.quantity || dto.quantity < 1) {
      throw new BadRequestException('request.INVALID_QUANTITY');
    }

    const request = await this.medicalEquipmentRepo.createRequest(
      requesterType,
      requesterId,
      dto.equipmentType,
      dto.quantity,
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
  ): Promise<MedicalEquipmentRequestsPageResponseDto> {
    try {
      const requests = await this.medicalEquipmentRepo.findByRequester(
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
  ): Promise<MedicalEquipmentRequestResponseDto> {
    const request = await this.medicalEquipmentRepo.findById(requestId);

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
    dto: UpdateMedicalEquipmentStatusDto,
    adminId?: string,
  ): Promise<MedicalEquipmentRequestResponseDto> {
    // Validate status
    if (!Object.values(EntityRequestStatus).includes(dto.status)) {
      throw new BadRequestException('request.INVALID_STATUS');
    }

    const request = await this.medicalEquipmentRepo.findById(requestId);

    // Validate status transition
    this.validateStatusTransition(request.status, dto.status);

    const updatedRequest = await this.medicalEquipmentRepo.updateStatus(
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
    const request = await this.medicalEquipmentRepo.findById(requestId);

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

    const deleted = await this.medicalEquipmentRepo.deleteRequest(requestId);
    if (!deleted) {
      throw new NotFoundException('request.NOT_FOUND');
    }
  }

  // ======== Get All Requests (Admin) ========
  async getAllRequests(
    filter?: {
      requesterType?: UserRole;
      equipmentType?: Machines;
      status?: EntityRequestStatus;
    },
    page: number = 1,
    limit: number = 10,
  ): Promise<MedicalEquipmentRequestsPageResponseDto> {
    const skip = (page - 1) * limit;

    const { requests, total } = await this.medicalEquipmentRepo.findAll(
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
  async getStatistics(): Promise<MedicalEquipmentStatisticsDto> {
    return this.medicalEquipmentRepo.getStatistics();
  }

  // ======== Get Pending Requests Count (Admin Dashboard) ========
  async getPendingRequestsCount(): Promise<number> {
    return this.medicalEquipmentRepo.countByStatus(EntityRequestStatus.PENDING);
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
        const request = await this.medicalEquipmentRepo.findById(requestId);
        this.validateStatusTransition(request.status, status);

        await this.medicalEquipmentRepo.updateStatus(requestId, status, {
          updatedBy: adminId,
          statusChangedAt: new Date(),
        });
        updated++;
      } catch (error) {
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
  ): Promise<MedicalEquipmentRequestResponseDto> {
    const request = await this.medicalEquipmentRepo.findById(requestId);

    if (
      request.status !== EntityRequestStatus.PENDING &&
      request.status !== EntityRequestStatus.UNDER_REVIEW
    ) {
      throw new BadRequestException('request.CANNOT_CONTACT');
    }

    const updatedRequest = await this.medicalEquipmentRepo.updateStatus(
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
  ): Promise<MedicalEquipmentRequestResponseDto> {
    const updatedRequest = await this.medicalEquipmentRepo.updateRequestFields(
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

  private mapToResponse(request: any): MedicalEquipmentRequestResponseDto {
    return {
      id: request._id.toString(),
      requesterType: request.requesterType,
      requesterId: request.requesterId.toString(),
      equipmentType: request.equipmentType,
      quantity: request.quantity,
      status: request.status,
      assignedTo: request.assignedTo,
      reviewNotes: request.reviewNotes,
      //  contactNotes: request.contactNotes,
      createdAt: request.createdAt,
      updatedAt: request.updatedAt,
      statusChangedAt: request.statusChangedAt,
    };
  }
}
