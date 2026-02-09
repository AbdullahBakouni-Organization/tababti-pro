import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SocketServerService } from './socket-server.service';

@ApiTags('Admin Notifications')
@Controller('notifications')
export class NotificationServiceController {
  private readonly logger = new Logger(NotificationServiceController.name);

  constructor(private adminGateway: SocketServerService) {}

  /**
   * Broadcast notification to all admins
   *
   * Called by: Home Service when doctor registers
   *
   * POST http://socket-service:3001/api/v1/notifications/admin/broadcast
   */
  @Post('admin/broadcast')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Broadcast notification to all admins' })
  @ApiResponse({ status: 200, description: 'Notification sent successfully' })
  broadcastToAdmins(
    @Body()
    payload: {
      event: string;
      data: any;
    },
  ) {
    this.logger.log(
      `Broadcasting "${payload.event}" to ${this.adminGateway.getStats().connectedAdmins} admin(s)`,
    );

    // Send via WebSocket
    const result = this.adminGateway.sendToAllAdmins(
      payload.event,
      payload.data,
    );

    return {
      success: true,
      message: `Notification sent to  admin(s)`,
      ...result,
    };
  }

  /**
   * Send to specific admin
   */
  @Post('admin/:adminId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send notification to specific admin' })
  sendToAdmin(
    @Param('adminId') adminId: string,
    @Body() payload: { event: string; data: any },
  ) {
    const result = this.adminGateway.sendToAdmin(
      adminId,
      payload.event,
      payload.data,
    );

    return {
      success: result.sent,
      message: result.sent
        ? `Notification sent to admin ${adminId}`
        : `Admin ${adminId} not connected`,
      ...result,
    };
  }

  /**
   * Get WebSocket statistics
   */
  @Get('stats')
  @ApiOperation({ summary: 'Get WebSocket connection statistics' })
  getStats() {
    return this.adminGateway.getStats();
  }

  /**
   * Check if specific admin is connected
   */
  @Get('admin/:adminId/status')
  @ApiOperation({ summary: 'Check if admin is connected' })
  checkAdminStatus(@Param('adminId') adminId: string) {
    const isConnected = this.adminGateway.isAdminConnected(adminId);

    return {
      adminId,
      isConnected,
      timestamp: new Date(),
    };
  }
}
