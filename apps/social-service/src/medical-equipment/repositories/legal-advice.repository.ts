import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { LegalAdviceRequest } from '@app/common/database/schemas/legal_advice_requests.schema';
import {
  EntityRequestStatus,
  UserRole,
  LegalAdviceCategory,
} from '@app/common/database/schemas/common.enums';

interface StatusUpdateOptions {
  updatedBy?: string;
  statusChangedAt?: Date;
  reviewNotes?: string;
  contactNotes?: string;
}

@Injectable()
export class LegalAdviceRepository {
  constructor(
    @InjectModel(LegalAdviceRequest.name)
    private readonly legalAdviceModel: Model<LegalAdviceRequest>,
  ) {}

  // ======== Create Legal Advice Request ========
  async createRequest(
    requesterType: UserRole,
    requesterId: string,
    legalAdviceType: LegalAdviceCategory,
  ): Promise<LegalAdviceRequest> {
    console.log('requesterId:', requesterId);
    if (!Types.ObjectId.isValid(requesterId)) {
      throw new BadRequestException('user.INVALID_ID');
    }

    return this.legalAdviceModel.create({
      requesterType,
      requesterId: new Types.ObjectId(requesterId),
      legalAdviceType,
      status: EntityRequestStatus.PENDING,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  // ======== Find Request by ID ========
  async findById(requestId: string): Promise<LegalAdviceRequest> {
    if (!Types.ObjectId.isValid(requestId)) {
      throw new BadRequestException('request.INVALID_ID');
    }

    const request = await this.legalAdviceModel
      .findById(new Types.ObjectId(requestId))
      .lean();

    if (!request) {
      throw new NotFoundException('request.NOT_FOUND');
    }

    return request;
  }

  // ======== Find Requests by Requester ========
  async findByRequester(
    requesterType: UserRole,
    requesterId: string,
    status?: EntityRequestStatus,
  ): Promise<LegalAdviceRequest[]> {
    if (!Types.ObjectId.isValid(requesterId)) {
      throw new BadRequestException('user.INVALID_ID');
    }

    const query: any = {
      requesterType,
      requesterId: new Types.ObjectId(requesterId),
    };

    if (status) {
      query.status = status;
    }

    return this.legalAdviceModel.find(query).sort({ createdAt: -1 }).lean();
  }

  // ======== Find All Requests (Admin) ========
  async findAll(
    filter?: {
      requesterType?: UserRole;
      legalAdviceType?: LegalAdviceCategory;
      status?: EntityRequestStatus;
    },
    skip: number = 0,
    limit: number = 10,
  ): Promise<{ requests: LegalAdviceRequest[]; total: number }> {
    const query: any = {};

    if (filter?.requesterType) {
      query.requesterType = filter.requesterType;
    }
    if (filter?.legalAdviceType) {
      query.legalAdviceType = filter.legalAdviceType;
    }
    if (filter?.status) {
      query.status = filter.status;
    }

    const [requests, total] = await Promise.all([
      this.legalAdviceModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.legalAdviceModel.countDocuments(query),
    ]);

    return { requests, total };
  }

  // ======== Update Request Status ========
  async updateStatus(
    requestId: string,
    status: EntityRequestStatus,
    options?: StatusUpdateOptions,
  ): Promise<LegalAdviceRequest> {
    if (!Types.ObjectId.isValid(requestId)) {
      throw new BadRequestException('request.INVALID_ID');
    }

    const updateData: any = {
      status,
      updatedAt: new Date(),
    };

    if (options?.updatedBy) {
      updateData.updatedBy = options.updatedBy;
    }
    if (options?.statusChangedAt) {
      updateData.statusChangedAt = options.statusChangedAt;
    }
    if (options?.reviewNotes) {
      updateData.reviewNotes = options.reviewNotes;
    }
    if (options?.contactNotes) {
      updateData.contactNotes = options.contactNotes;
    }

    const request = await this.legalAdviceModel
      .findByIdAndUpdate(new Types.ObjectId(requestId), updateData, {
        new: true,
      })
      .lean();

    if (!request) {
      throw new NotFoundException('request.NOT_FOUND');
    }

    return request;
  }

  // ======== Update Request Fields (for reassignment, notes, etc.) ========
  async updateRequestFields(
    requestId: string,
    updates: Record<string, any>,
  ): Promise<LegalAdviceRequest> {
    if (!Types.ObjectId.isValid(requestId)) {
      throw new BadRequestException('request.INVALID_ID');
    }

    const request = await this.legalAdviceModel
      .findByIdAndUpdate(
        new Types.ObjectId(requestId),
        { ...updates, updatedAt: new Date() },
        { new: true },
      )
      .lean();

    if (!request) {
      throw new NotFoundException('request.NOT_FOUND');
    }

    return request;
  }

  // ======== Delete Request ========
  async deleteRequest(requestId: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(requestId)) {
      throw new BadRequestException('request.INVALID_ID');
    }

    const result = await this.legalAdviceModel.deleteOne({
      _id: new Types.ObjectId(requestId),
    });

    return result.deletedCount === 1;
  }

  // ======== Count by Status ========
  async countByStatus(status: EntityRequestStatus): Promise<number> {
    return this.legalAdviceModel.countDocuments({ status });
  }

  // ======== Get Statistics ========
  async getStatistics(): Promise<{
    totalRequests: number;
    pendingRequests: number;
    underReviewRequests: number;
    contactedRequests: number;
    completedRequests: number;
    cancelledRequests: number;
    requestsByType: Record<string, number>;
  }> {
    const [
      totalRequests,
      pendingRequests,
      underReviewRequests,
      contactedRequests,
      completedRequests,
      cancelledRequests,
    ] = await Promise.all([
      this.legalAdviceModel.countDocuments(),
      this.legalAdviceModel.countDocuments({
        status: EntityRequestStatus.PENDING,
      }),
      this.legalAdviceModel.countDocuments({
        status: EntityRequestStatus.UNDER_REVIEW,
      }),
      this.legalAdviceModel.countDocuments({
        status: EntityRequestStatus.CONTACTED,
      }),
      this.legalAdviceModel.countDocuments({
        status: EntityRequestStatus.COMPLETED,
      }),
      this.legalAdviceModel.countDocuments({
        status: EntityRequestStatus.CANCELLED,
      }),
    ]);

    const requestsByType = await this.legalAdviceModel.aggregate([
      {
        $group: {
          _id: '$legalAdviceType',
          count: { $sum: 1 },
        },
      },
    ]);

    return {
      totalRequests,
      pendingRequests,
      underReviewRequests,
      contactedRequests,
      completedRequests,
      cancelledRequests,
      requestsByType: Object.fromEntries(
        requestsByType.map((item: any) => [item._id, item.count]),
      ),
    };
  }

  // ======== Find by Status ========
  async findByStatus(
    status: EntityRequestStatus,
    skip: number = 0,
    limit: number = 10,
  ): Promise<{ requests: LegalAdviceRequest[]; total: number }> {
    const [requests, total] = await Promise.all([
      this.legalAdviceModel
        .find({ status })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.legalAdviceModel.countDocuments({ status }),
    ]);

    return { requests, total };
  }

  // ======== Get Requests Assigned to Admin ========
  async findByAssignee(
    adminId: string,
    skip: number = 0,
    limit: number = 10,
  ): Promise<{ requests: LegalAdviceRequest[]; total: number }> {
    const [requests, total] = await Promise.all([
      this.legalAdviceModel
        .find({ assignedTo: adminId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.legalAdviceModel.countDocuments({ assignedTo: adminId }),
    ]);

    return { requests, total };
  }

  // ======== Get Overdue Requests (not completed within X days) ========
  async findOverdueRequests(days: number = 7): Promise<LegalAdviceRequest[]> {
    const thresholdDate = new Date();
    thresholdDate.setDate(thresholdDate.getDate() - days);

    return this.legalAdviceModel
      .find({
        status: { $ne: EntityRequestStatus.COMPLETED },
        createdAt: { $lt: thresholdDate },
      })
      .sort({ createdAt: 1 })
      .lean();
  }
}
