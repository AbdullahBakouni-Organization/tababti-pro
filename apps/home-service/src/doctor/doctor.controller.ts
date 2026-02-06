// ============================================
// Doctor Registration Controller
// ============================================

import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
  UseInterceptors,
  Res,
  UploadedFiles,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
} from '@nestjs/swagger';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { DoctorService } from './doctor.service';
import { AuthValidateService } from '../../../../libs/common/src/auth-validate/auth-validate.service';
import {
  DoctorRegistrationDtoValidated,
  RegistrationResponseDto,
} from './dto/sign-up.dto';
import { JwtAuthGuard } from '../../../../libs/common/src/guards/jwt.guard';

import { doctorDocumentOptions } from '../../../../libs/common/src/helpers/file-upload.helper';
import { MultipleFileCleanupInterceptor } from '../../../../libs/common/src/interceptors/multiple-file-cleanup.interceptor';
import { DocumentUrlInterceptor } from '../../../../libs/common/src/interceptors/document-url.interceptor';
import type { Request, Response } from 'express';
import { JwtRefreshGuard } from '@app/common/guards/jwt-refresh.guard';
import { RolesGuard } from '@app/common/guards/role.guard';
import { UserRole } from '@app/common/database/schemas/common.enums';
import { Roles } from '@app/common/decorator/role.decorator';

// ============================================
// Login DTO
// ============================================

export class LoginDto {
  phone: string;
  password: string;
  deviceInfo: {
    deviceId: string;
    deviceName: string;
    deviceType: 'mobile' | 'tablet' | 'desktop';
    platform: 'ios' | 'android' | 'web';
  };
}

// ============================================
// Registration Controller
// ============================================

@ApiTags('Doctor Registration')
@Controller('doctors')
export class DoctorController {
  constructor(
    private registrationService: DoctorService,
    private authService: AuthValidateService,
  ) {}

  // ============================================
  // PUBLIC ENDPOINTS
  // ============================================

  /**
   * Register a new doctor with document uploads
   */
  @Post('register')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'certificateImage', maxCount: 1 },
        { name: 'licenseImage', maxCount: 1 },
        { name: 'certificateDocument', maxCount: 1 },
        { name: 'licenseDocument', maxCount: 1 },
      ],
      doctorDocumentOptions,
    ),
    MultipleFileCleanupInterceptor,
    DocumentUrlInterceptor,
  )
  @HttpCode(HttpStatus.CREATED)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Register a new doctor with certificate and license documents',
    description: `
    Upload certificate and license as either images or PDFs:
    - certificateImage: Certificate as image (JPEG, PNG, WEBP)
    - licenseImage: License as image (JPEG, PNG, WEBP)
    - certificateDocument: Certificate as PDF
    - licenseDocument: License as PDF

    You can upload either image OR PDF for each document type.
    Images are stored in /uploads/doctors/images
    PDFs are stored in /uploads/doctors/documents
    `,
  })
  @ApiResponse({
    status: 201,
    description: 'Doctor registered successfully',
    type: RegistrationResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Validation error or invalid file type',
  })
  @ApiResponse({
    status: 409,
    description: 'Duplicate registration (pending)',
  })
  async register(
    @Body() dto: DoctorRegistrationDtoValidated,
    @Res({ passthrough: true }) res: Response,
    @UploadedFiles()
    files?: {
      certificateImage?: Express.Multer.File[];
      licenseImage?: Express.Multer.File[];
      certificateDocument?: Express.Multer.File[];
      licenseDocument?: Express.Multer.File[];
    },
  ): Promise<RegistrationResponseDto> {
    // Process uploaded files
    const processedFiles = this.processUploadedFiles(files);

    const result = await this.registrationService.registerDoctor(
      dto,
      processedFiles,
    );

    return {
      success: true,
      message:
        'Registration submitted successfully! ' +
        'Your application is under review. ' +
        'You will be notified once approved.',
      doctorId: result._id.toString(),
      status: result.status,
      estimatedReviewTime: '24-48 hours',
      uploadedFiles: processedFiles
        ? {
            certificateImage: processedFiles.certificateImage?.path,
            licenseImage: processedFiles.licenseImage?.path,
            certificateDocument: processedFiles.certificateDocument?.path,
            licenseDocument: processedFiles.licenseDocument?.path,
          }
        : undefined,
    };
  }

  /**
   * Process uploaded files from multipart form
   */
  private processUploadedFiles(files?: {
    certificateImage?: Express.Multer.File[];
    licenseImage?: Express.Multer.File[];
    certificateDocument?: Express.Multer.File[];
    licenseDocument?: Express.Multer.File[];
  }):
    | {
        certificateImage?: Express.Multer.File;
        licenseImage?: Express.Multer.File;
        certificateDocument?: Express.Multer.File;
        licenseDocument?: Express.Multer.File;
      }
    | undefined {
    if (!files) return undefined;

    const result: {
      certificateImage?: Express.Multer.File;
      licenseImage?: Express.Multer.File;
      certificateDocument?: Express.Multer.File;
      licenseDocument?: Express.Multer.File;
    } = {};

    // Extract single files from arrays
    if (files.certificateImage?.[0]) {
      result.certificateImage = files.certificateImage[0];
    }
    if (files.licenseImage?.[0]) {
      result.licenseImage = files.licenseImage[0];
    }
    if (files.certificateDocument?.[0]) {
      result.certificateDocument = files.certificateDocument[0];
    }
    if (files.licenseDocument?.[0]) {
      result.licenseDocument = files.licenseDocument[0];
    }

    return Object.keys(result).length > 0 ? result : undefined;
  }

  /**
   * Login
   */
  // @Post('login')
  // @HttpCode(HttpStatus.OK)
  // @ApiOperation({ summary: 'Doctor login' })
  // @ApiResponse({
  //   status: 200,
  //   description: 'Login successful',
  // })
  // @ApiResponse({
  //   status: 401,
  //   description: 'Invalid credentials or account not approved',
  // })
  // async login(
  //   @Body() loginDto: LoginDto,
  //   @Req() req: Request,
  // ): Promise<{
  //   accessToken: string;
  //   refreshToken: string;
  //   doctor: any;
  //   session: any;
  // }> {
  //   // 1. Find doctor
  //   const doctor = await this.registrationService.findByPhone(loginDto.phone);

  //   if (!doctor) {
  //     throw new UnauthorizedException('Invalid phone or password');
  //   }

  //   // 2. Check status
  //   if (doctor.status === 'pending') {
  //     throw new UnauthorizedException(
  //       'Your account is pending approval. Please wait for admin review.',
  //     );
  //   }

  //   if (doctor.status === 'rejected') {
  //     throw new UnauthorizedException(
  //       `Your account was rejected. Reason: ${doctor.rejectionReason || 'Not specified'}`,
  //     );
  //   }

  //   if (doctor.status === 'suspended') {
  //     throw new UnauthorizedException('Your account has been suspended.');
  //   }

  //   // 3. Check if account is locked
  //   if (doctor.isAccountLocked) {
  //     throw new UnauthorizedException(
  //       `Account locked due to too many failed login attempts. ` +
  //         `Please try again after ${doctor.lockedUntil?.toLocaleTimeString()}`,
  //     );
  //   }

  //   // 4. Verify password
  //   const isValidPassword = await doctor.comparePassword(loginDto.password);

  //   if (!isValidPassword) {
  //     await doctor.incrementFailedAttempts();
  //     await doctor.save();

  //     throw new UnauthorizedException('Invalid phone or password');
  //   }

  //   // 5. Reset failed attempts on successful login
  //   doctor.resetFailedAttempts();

  //   // 6. Create session
  //   const sessionInfo: SessionInfo = {
  //     sessionId: '', // Will be generated by AuthService
  //     deviceId: loginDto.deviceInfo.deviceId,
  //     deviceName: loginDto.deviceInfo.deviceName,
  //     deviceType: loginDto.deviceInfo.deviceType,
  //     platform: loginDto.deviceInfo.platform,
  //     ipAddress: req.ip || req.socket.remoteAddress || 'unknown',
  //     userAgent: req.headers['user-agent'] || 'unknown',
  //   };

  //   const tokens = await this.authService.createSession(doctor, sessionInfo);

  //   // 7. Return response
  //   return {
  //     accessToken: tokens.accessToken,
  //     refreshToken: tokens.refreshToken,
  //     doctor: {
  //       id: doctor._id,
  //       fullName: doctor.fullName,
  //       phone: doctor.phone,
  //       city: doctor.city,
  //       specialization: doctor.privateSpecialization,
  //       status: doctor.status,
  //     },
  //     session: {
  //       deviceName: sessionInfo.deviceName,
  //       platform: sessionInfo.platform,
  //       createdAt: new Date(),
  //     },
  //   };
  // }

  /**
   * Refresh access token
   */
  @Post('refresh')
  @UseGuards(JwtRefreshGuard, RolesGuard)
  @Roles(UserRole.DOCTOR)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token' })
  async refreshToken(@Body('refreshToken') refreshToken: string): Promise<{
    success: boolean;
    accessToken: string;
    refreshToken: string;
  }> {
    const tokens = await this.authService.refreshAccessToken(refreshToken);

    return {
      success: true,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
  }

  // ============================================
  // PROTECTED ENDPOINTS (Require Authentication)
  // ============================================

  /**
   * Get current doctor profile
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current doctor profile' })
  getProfile() {
    // This method needs to be implemented with proper doctor service methods
    throw new Error('Method not implemented yet');
  }

  /**
   * Get all active sessions
   */
  // @Get('sessions')
  // @UseGuards(JwtAuthGuard)
  // @ApiBearerAuth()
  // @ApiOperation({ summary: 'Get all active sessions for current doctor' })
  // async getActiveSessions(@Req() req: any) {
  //   const doctorId: string = req.user.sub;
  //   const sessions = await this.authService.getActiveSessions(doctorId);

  //   return {
  //     total: sessions.length,
  //     sessions,
  //   };
  // }

  /**
   * Logout from current session
   */
  @Post('logout')
  @UseGuards(JwtRefreshGuard, RolesGuard)
  @Roles(UserRole.DOCTOR)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Logout from current session' })
  async logout(@Req() req: any) {
    const doctorId: string = req.user.accountId;
    const sessionId: string = req.user.sessionId;

    await this.authService.logoutSession(doctorId, UserRole.DOCTOR, sessionId);

    return {
      message: 'Logged out successfully',
    };
  }

  /**
   * Logout from specific device
   */
  @Post('logout/device/:deviceId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Logout from specific device' })
  async logoutDevice(@Req() req: any, @Param('deviceId') deviceId: string) {
    const doctorId: string = req.user.accountId;

    await this.authService.logoutDevice(doctorId, UserRole.DOCTOR, deviceId);

    return {
      message: `Logged out from device: ${deviceId}`,
    };
  }

  /**
   * Logout from all devices
   */
  @Post('logout/all')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Logout from all devices' })
  async logoutAll(@Req() req: any) {
    const doctorId: string = req.user.accountId;

    await this.authService.logoutAllSessions(doctorId, UserRole.DOCTOR);

    return {
      message: 'Logged out from all devices',
    };
  }

  // ============================================
  // ADMIN ENDPOINTS (Require Admin Role)
  // ============================================

  /**
   * Get pending registrations (Admin only)
   */
  // @Get('admin/pending')
  // @UseGuards(JwtAuthGuard, AdminGuard)
  // @ApiBearerAuth()
  // @ApiOperation({ summary: 'Get all pending doctor registrations (Admin)' })
  // async getPendingRegistrations(
  //   @Query('page') page: number = 1,
  //   @Query('limit') limit: number = 20,
  // ) {
  //   return this.registrationService.getPendingRegistrations(page, limit);
  // }

  // /**
  //  * Approve doctor (Admin only)
  //  */
  // @Patch('admin/:doctorId/approve')
  // @UseGuards(JwtAuthGuard, AdminGuard)
  // @ApiBearerAuth()
  // @HttpCode(HttpStatus.OK)
  // @ApiOperation({ summary: 'Approve doctor registration (Admin)' })
  // async approveDoctor(@Param('doctorId') doctorId: string, @Req() req: any) {
  //   const adminId = req.user.sub;
  //   const doctor = await this.registrationService.approveDoctor(
  //     doctorId,
  //     adminId,
  //   );

  //   return {
  //     message: 'Doctor approved successfully',
  //     doctor: {
  //       id: doctor._id,
  //       fullName: doctor.fullName,
  //       status: doctor.status,
  //       approvedAt: doctor.approvedAt,
  //     },
  //   };
  // }

  // /**
  //  * Reject doctor (Admin only)
  //  */
  // @Patch('admin/:doctorId/reject')
  // @UseGuards(JwtAuthGuard, AdminGuard)
  // @ApiBearerAuth()
  // @HttpCode(HttpStatus.OK)
  // @ApiOperation({ summary: 'Reject doctor registration (Admin)' })
  // async rejectDoctor(
  //   @Param('doctorId') doctorId: string,
  //   @Body('reason') reason: string,
  //   @Req() req: any,
  // ) {
  //   const adminId = req.user.sub;
  //   const doctor = await this.registrationService.rejectDoctor(
  //     doctorId,
  //     adminId,
  //     reason,
  //   );

  //   return {
  //     message: 'Doctor rejected',
  //     doctor: {
  //       id: doctor._id,
  //       fullName: doctor.fullName,
  //       status: doctor.status,
  //       rejectedAt: doctor.rejectedAt,
  //       reason: doctor.rejectionReason,
  //     },
  //   };
  // }
}
