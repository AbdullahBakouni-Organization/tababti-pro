import {
  Body,
  Controller,
  Get,
  Headers,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger';
import { IsMongoId } from 'class-validator';

import { NotificationDisplayService } from './notification-display.service';
import { GetNotificationsDto } from './dto/get-notifications.dto';
import { ApiResponse } from '../common/response/api-response';
import { CurrentUser } from '@app/common/decorator/current-user.decorator';
import { JwtAuthGuard } from '@app/common/guards/jwt.guard';
import { RolesGuard } from '@app/common/guards/role.guard';
import { Roles } from '@app/common/decorator/role.decorator';
import { UserRole } from '@app/common/database/schemas/common.enums';

class MarkReadDto {
  @ApiProperty({ type: [String] })
  @IsMongoId({ each: true })
  ids: string[];
}

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
export class NotificationDisplayController {
  constructor(private readonly svc: NotificationDisplayService) {}

  @Get('unread-count')
  @Roles(UserRole.USER, UserRole.DOCTOR, UserRole.HOSPITAL, UserRole.CENTER)
  @ApiOperation({ summary: 'Badge count — unread notifications only' })
  async unreadCount(
    @CurrentUser('accountId') accountId: string,
    @CurrentUser('role') role: UserRole,
    @Headers('accept-language') lang: 'en' | 'ar' = 'en',
  ) {
    const data = await this.svc.getUnreadCount(accountId, role);
    return ApiResponse.success({
      lang,
      messageKey: 'notification.UNREAD_COUNT',
      data,
    });
  }

  @Get()
  @Roles(UserRole.USER, UserRole.DOCTOR, UserRole.HOSPITAL, UserRole.CENTER)
  @ApiOperation({ summary: 'Paginated notification list' })
  async list(
    @CurrentUser('accountId') accountId: string,
    @CurrentUser('role') role: UserRole,
    @Query() query: GetNotificationsDto,
    @Headers('accept-language') lang: 'en' | 'ar' = 'en',
  ) {
    const data = await this.svc.getNotifications(accountId, role, query);
    return ApiResponse.success({ lang, messageKey: 'notification.LIST', data });
  }

  @Patch('read')
  @Roles(UserRole.USER, UserRole.DOCTOR, UserRole.HOSPITAL, UserRole.CENTER)
  @ApiOperation({ summary: 'Mark specific notifications as read' })
  async markRead(
    @CurrentUser('accountId') accountId: string,
    @CurrentUser('role') role: UserRole,
    @Body() body: MarkReadDto,
    @Headers('accept-language') lang: 'en' | 'ar' = 'en',
  ) {
    const data = await this.svc.markAsRead(accountId, role, body.ids);
    return ApiResponse.success({
      lang,
      messageKey: 'notification.MARKED_READ',
      data,
    });
  }

  @Patch('read/all')
  @Roles(UserRole.USER, UserRole.DOCTOR, UserRole.HOSPITAL, UserRole.CENTER)
  @ApiOperation({ summary: 'Mark all notifications as read' })
  async markAllRead(
    @CurrentUser('accountId') accountId: string,
    @CurrentUser('role') role: UserRole,
    @Headers('accept-language') lang: 'en' | 'ar' = 'en',
  ) {
    const data = await this.svc.markAllAsRead(accountId, role);
    return ApiResponse.success({
      lang,
      messageKey: 'notification.ALL_MARKED_READ',
      data,
    });
  }
}
