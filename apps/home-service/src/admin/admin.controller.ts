import {
  Controller,
  Post,
  Put,
  Delete,
  Get,
  Body,
  Param,
  UseGuards,
  Res,
  HttpCode,
  HttpStatus,
  Req,
  Patch,
} from '@nestjs/common';
import { AdminService } from './admin.service';

import { AdminSignInDto } from './dto/admin-signin.dto';

import type { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AuthValidateService, SessionInfo } from '@app/common/auth-validate';
import type { Request } from 'express';
import { JwtAuthGuard } from '@app/common/guards/jwt.guard';
import { RolesGuard } from '@app/common/guards/role.guard';
import { Roles } from '@app/common/decorator/role.decorator';
import { UserRole } from '@app/common/database/schemas/common.enums';
import { JwtRefreshGuard } from '@app/common/guards/jwt-refresh.guard';

@Controller('admin')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private authService: AuthValidateService,
  ) {}

  // Admin Sign In
  @Post('signin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Admin login' })
  @ApiResponse({
    status: 200,
    description: 'Login successful',
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid credentials or account not approved',
  })
  async signIn(
    @Body() dto: AdminSignInDto,
    @Res({ passthrough: true }) res: Response,
    @Req() req: Request,
  ): Promise<{
    accessToken: string;
    admin: any;
    refreshToken?: string;
    session: any;
  }> {
    // return this.adminService.signIn(dto, res);
    const admin = await this.adminService.signIn(dto);

    // 6. Create session
    const sessionInfo: SessionInfo = {
      sessionId: '', // generated later
      deviceId: dto.deviceInfo.deviceId,
      deviceName: dto.deviceInfo.deviceName,
      deviceType: dto.deviceInfo.deviceType,
      platform: dto.deviceInfo.platform,
      ipAddress: req.ip || req.socket.remoteAddress || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown',
    };

    const tokens = await this.authService.createSession(
      admin.authAccountId.toString(),
      admin.phone,
      UserRole.ADMIN,
      sessionInfo,
    );
    res.cookie('token', tokens.refreshToken, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000 * 30, // 30 days
      path: '/',
    });
    return {
      accessToken: tokens.accessToken,
      admin: {
        id: admin._id.toString(),
        fullName: admin.username,
        phone: admin.phone,
      },
      session: {
        deviceName: sessionInfo.deviceName,
        platform: sessionInfo.platform,
        createdAt: new Date(),
      },
    };
  }

  @Post('refresh')
  @UseGuards(JwtRefreshGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token' })
  async refreshToken(
    @Body('refreshToken') refreshToken: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{
    success: boolean;
    accessToken: string;
    refreshToken?: string;
  }> {
    const tokens = await this.authService.refreshAccessToken(refreshToken);
    res.cookie('token', tokens.refreshToken, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000 * 30, // 30 days
      path: '/',
    });
    return {
      success: true,
      accessToken: tokens.accessToken,
    };
  }

  @Post('logout/all')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Logout from all devices' })
  async logoutAll(@Req() req: any) {
    const adminId: string = req.user.accountId;
    const role: UserRole.ADMIN = req.user.role;
    await this.authService.logoutAllSessions(adminId, role);

    return {
      success: true,
      message: 'Logged out from all devices',
    };
  }

  @Patch('approve/:doctorId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve doctor registration (Admin)' })
  async approveDoctor(
    @Param('doctorId') doctorId: string,
    @Req() req: any,
  ): Promise<{
    success: boolean;
    message: string;
  }> {
    const adminId: string = req.user.accountId;
    await this.adminService.approveDoctor(doctorId, adminId);
    return {
      success: true,
      message: 'Doctor approved successfully',
    };
  }

  @Patch('reject/:doctorId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject doctor registration (Admin)' })
  async rejectDoctor(
    @Param('doctorId') doctorId: string,
    @Body() reason: string,
    @Req() req: any,
  ): Promise<{
    success: boolean;
    message: string;
  }> {
    const adminId: string = req.user.accountId;
    await this.adminService.rejectedDoctor(doctorId, adminId, reason);
    return {
      success: true,
      message: 'Doctor rejected successfully',
    };
  }
}
