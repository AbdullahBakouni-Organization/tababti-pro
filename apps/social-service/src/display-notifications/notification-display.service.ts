import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { Notification } from '@app/common/database/schemas/notification.schema';
import {
  NotificationStatus,
  UserRole,
} from '@app/common/database/schemas/common.enums';
import { User } from '@app/common/database/schemas/user.schema';
import { Doctor } from '@app/common/database/schemas/doctor.schema';
import { Hospital } from '@app/common/database/schemas/hospital.schema';
import { Center } from '@app/common/database/schemas/center.schema';
import { GetNotificationsDto } from './dto/get-notifications.dto';

@Injectable()
export class NotificationDisplayService {
  constructor(
    @InjectModel(Notification.name)
    private readonly notifModel: Model<Notification>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(Doctor.name) private readonly doctorModel: Model<Doctor>,
    @InjectModel(Hospital.name) private readonly hospitalModel: Model<Hospital>,
    @InjectModel(Center.name) private readonly centerModel: Model<Center>,
  ) {}

  // ── GET /notifications ─────────────────────────────────────────────────────

  async getNotifications(
    authAccountId: string,
    role: UserRole,
    dto: GetNotificationsDto,
  ) {
    const recipientId = await this.resolveProfileId(authAccountId, role);
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const skip = (page - 1) * limit;

    const match: Record<string, any> = { recipientId, recipientType: role };
    if (dto.unreadOnly) match.isRead = false;

    const [docs, total, unreadCount] = await Promise.all([
      this.notifModel
        .find(match)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.notifModel.countDocuments(match),
      this.notifModel.countDocuments({
        recipientId,
        recipientType: role,
        isRead: false,
      }),
    ]);

    return {
      notifications: docs.map((n: any) => ({
        id: n._id,
        type: n.Notificationtype,
        title: n.title,
        message: n.message,
        status: n.status,
        isRead: n.isRead,
        createdAt: n.createdAt,
        timeAgo: this.timeAgo(n.createdAt),
      })),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        unreadCount,
      },
    };
  }

  // ── GET /notifications/unread-count ───────────────────────────────────────

  async getUnreadCount(authAccountId: string, role: UserRole) {
    const recipientId = await this.resolveProfileId(authAccountId, role);
    const count = await this.notifModel.countDocuments({
      recipientId,
      recipientType: role,
      isRead: false,
    });
    return { unreadCount: count };
  }

  // ── PATCH /notifications/read ─────────────────────────────────────────────

  async markAsRead(authAccountId: string, role: UserRole, ids: string[]) {
    if (ids.some((id) => !Types.ObjectId.isValid(id)))
      throw new BadRequestException('notification.INVALID_IDS');

    const recipientId = await this.resolveProfileId(authAccountId, role);
    const result = await this.notifModel.updateMany(
      {
        _id: { $in: ids.map((id) => new Types.ObjectId(id)) },
        recipientId,
        isRead: false,
      },
      { $set: { isRead: true, status: NotificationStatus.DELIVERED } },
    );
    return { updated: result.modifiedCount };
  }

  // ── PATCH /notifications/read/all ─────────────────────────────────────────

  async markAllAsRead(authAccountId: string, role: UserRole) {
    const recipientId = await this.resolveProfileId(authAccountId, role);
    const result = await this.notifModel.updateMany(
      { recipientId, recipientType: role, isRead: false },
      { $set: { isRead: true, status: NotificationStatus.DELIVERED } },
    );
    return { updated: result.modifiedCount };
  }

  // ── Helper ────────────────────────────────────────────────────────────────

  private async resolveProfileId(
    authAccountId: string,
    role: UserRole,
  ): Promise<Types.ObjectId> {
    if (!Types.ObjectId.isValid(authAccountId))
      throw new BadRequestException('user.INVALID_ID');

    const modelMap: Partial<Record<UserRole, Model<any>>> = {
      [UserRole.USER]: this.userModel,
      [UserRole.DOCTOR]: this.doctorModel,
      [UserRole.HOSPITAL]: this.hospitalModel,
      [UserRole.CENTER]: this.centerModel,
    };

    const profile = await modelMap[role]
      ?.findOne(
        { authAccountId: new Types.ObjectId(authAccountId) },
        { _id: 1 },
      )
      .lean();

    if (!profile) throw new NotFoundException('user.NOT_FOUND');
    return (profile as any)._id as Types.ObjectId;
  }

  private timeAgo(date: Date): string {
    const mins = Math.floor((Date.now() - new Date(date).getTime()) / 60_000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }
}
