import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { MedicalEquipmentRequest } from '@app/common/database/schemas/medical_equipment_requests.schema';
import { EntityRequestStatus, UserRole, Machines } from '@app/common/database/schemas/common.enums';

interface StatusUpdateOptions {
    updatedBy?: string;
    statusChangedAt?: Date;
    reviewNotes?: string;
    contactNotes?: string;
}

@Injectable()
export class MedicalEquipmentRepository {
    constructor(
        @InjectModel(MedicalEquipmentRequest.name)
        private readonly medicalEquipmentModel: Model<MedicalEquipmentRequest>,
    ) { }

    // ======== Create Equipment Request ========
    async createRequest(
        requesterType: UserRole,
        requesterId: string,
        equipmentType: Machines,
        quantity: number,
    ): Promise<MedicalEquipmentRequest> {
        if (!Types.ObjectId.isValid(requesterId)) {
            throw new BadRequestException('user.INVALID_ID');
        }

        return this.medicalEquipmentModel.create({
            requesterType,
            requesterId: new Types.ObjectId(requesterId),
            equipmentType,
            quantity,
            status: EntityRequestStatus.PENDING,
            createdAt: new Date(),
            updatedAt: new Date(),
        });
    }

    // ======== Find Request by ID ========
    async findById(requestId: string): Promise<MedicalEquipmentRequest> {
        if (!Types.ObjectId.isValid(requestId)) {
            throw new BadRequestException('request.INVALID_ID');
        }

        const request = await this.medicalEquipmentModel.findById(
            new Types.ObjectId(requestId),
        ).lean();

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
    ): Promise<MedicalEquipmentRequest[]> {
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

        return this.medicalEquipmentModel
            .find(query)
            .sort({ createdAt: -1 })
            .lean();
    }

    // ======== Find All Requests (Admin) ========
    async findAll(
        filter?: {
            requesterType?: UserRole;
            equipmentType?: Machines;
            status?: EntityRequestStatus;
        },
        skip: number = 0,
        limit: number = 10,
    ): Promise<{ requests: MedicalEquipmentRequest[]; total: number }> {
        const query: any = {};

        if (filter?.requesterType) {
            query.requesterType = filter.requesterType;
        }
        if (filter?.equipmentType) {
            query.equipmentType = filter.equipmentType;
        }
        if (filter?.status) {
            query.status = filter.status;
        }

        const [requests, total] = await Promise.all([
            this.medicalEquipmentModel
                .find(query)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            this.medicalEquipmentModel.countDocuments(query),
        ]);

        return { requests, total };
    }

    // ======== Update Request Status ========
    async updateStatus(
        requestId: string,
        status: EntityRequestStatus,
        options?: StatusUpdateOptions,
    ): Promise<MedicalEquipmentRequest> {
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

        const request = await this.medicalEquipmentModel.findByIdAndUpdate(
            new Types.ObjectId(requestId),
            updateData,
            { new: true },
        ).lean();

        if (!request) {
            throw new NotFoundException('request.NOT_FOUND');
        }

        return request;
    }

    // ======== Update Request Fields (for reassignment, notes, etc.) ========
    async updateRequestFields(
        requestId: string,
        updates: Record<string, any>,
    ): Promise<MedicalEquipmentRequest> {
        if (!Types.ObjectId.isValid(requestId)) {
            throw new BadRequestException('request.INVALID_ID');
        }

        const request = await this.medicalEquipmentModel.findByIdAndUpdate(
            new Types.ObjectId(requestId),
            { ...updates, updatedAt: new Date() },
            { new: true },
        ).lean();

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

        const result = await this.medicalEquipmentModel.deleteOne({
            _id: new Types.ObjectId(requestId),
        });

        return result.deletedCount === 1;
    }

    // ======== Count by Status ========
    async countByStatus(status: EntityRequestStatus): Promise<number> {
        return this.medicalEquipmentModel.countDocuments({ status });
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
            this.medicalEquipmentModel.countDocuments(),
            this.medicalEquipmentModel.countDocuments({
                status: EntityRequestStatus.PENDING,
            }),
            this.medicalEquipmentModel.countDocuments({
                status: EntityRequestStatus.UNDER_REVIEW,
            }),
            this.medicalEquipmentModel.countDocuments({
                status: EntityRequestStatus.CONTACTED,
            }),
            this.medicalEquipmentModel.countDocuments({
                status: EntityRequestStatus.COMPLETED,
            }),
            this.medicalEquipmentModel.countDocuments({
                status: EntityRequestStatus.CANCELLED,
            }),
        ]);

        const requestsByType = await this.medicalEquipmentModel.aggregate([
            {
                $group: {
                    _id: '$equipmentType',
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
    ): Promise<{ requests: MedicalEquipmentRequest[]; total: number }> {
        const [requests, total] = await Promise.all([
            this.medicalEquipmentModel
                .find({ status })
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            this.medicalEquipmentModel.countDocuments({ status }),
        ]);

        return { requests, total };
    }

    // ======== Get Requests Assigned to Admin ========
    async findByAssignee(
        adminId: string,
        skip: number = 0,
        limit: number = 10,
    ): Promise<{ requests: MedicalEquipmentRequest[]; total: number }> {
        const [requests, total] = await Promise.all([
            this.medicalEquipmentModel
                .find({ assignedTo: adminId })
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            this.medicalEquipmentModel.countDocuments({ assignedTo: adminId }),
        ]);

        return { requests, total };
    }

    // ======== Get Overdue Requests (not completed within X days) ========
    async findOverdueRequests(days: number = 7): Promise<MedicalEquipmentRequest[]> {
        const thresholdDate = new Date();
        thresholdDate.setDate(thresholdDate.getDate() - days);

        return this.medicalEquipmentModel
            .find({
                status: { $ne: EntityRequestStatus.COMPLETED },
                createdAt: { $lt: thresholdDate },
            })
            .sort({ createdAt: 1 })
            .lean();
    }
}