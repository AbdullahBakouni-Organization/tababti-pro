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
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
  ApiNotFoundResponse,
  ApiBadRequestResponse,
  ApiUnauthorizedResponse,
  ApiQuery,
} from '@nestjs/swagger';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { DoctorService } from './doctor.service';
import {
  AuthValidateService,
  SessionInfo,
} from '../../../../libs/common/src/auth-validate/auth-validate.service';
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
import { DoctorLoginDto } from './dto/login.dto';
import {
  RequestDoctorPasswordResetDto,
  ResetDoctorPasswordDto,
  VerifyOtpForPasswordResetDto,
} from './dto/doctor-forgot-password.dto';
import { GetDoctorBookingsByLocationDto } from './dto/booking-responce.dto';

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
    private DoctorService: DoctorService,
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

    const result = await this.DoctorService.registerDoctor(dto, processedFiles);

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
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Doctor login' })
  @ApiResponse({
    status: 200,
    description: 'Login successful',
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid credentials or account not approved',
  })
  async signIn(
    @Body() dto: DoctorLoginDto,
    @Res({ passthrough: true }) res: Response,
    @Req() req: Request,
  ): Promise<{
    accessToken: string;
    doctor: any;
    refreshToken?: string;
    session: any;
  }> {
    // return this.adminService.signIn(dto, res);
    const doctor = await this.DoctorService.loginDoctor(dto);

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
      doctor.authAccountId.toString(),
      doctor.phones?.[0]?.normal?.[0] ?? '',
      UserRole.DOCTOR,
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
      doctor: {
        id: doctor._id.toString(),
        fullName: doctor.firstName + ' ' + doctor.lastName,
        phone: doctor.phones?.[0]?.normal?.[0] ?? '',
      },
      session: {
        deviceName: sessionInfo.deviceName,
        platform: sessionInfo.platform,
        createdAt: new Date(),
      },
    };
  }

  @Post('forgot-password/request-otp')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DOCTOR)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'طلب رمز التحقق لإعادة تعيين كلمة المرور',
    description: 'يرسل رمز تحقق OTP إلى رقم الهاتف المسجل للطبيب',
  })
  @ApiResponse({
    status: 200,
    description: 'تم إرسال رمز التحقق بنجاح',
    schema: {
      example: {
        success: true,
        message: 'تم إرسال رمز التحقق إلى رقم هاتفك',
      },
    },
  })
  @ApiNotFoundResponse({
    description: 'لا يوجد حساب طبيب مسجل بهذا الرقم',
  })
  @ApiBadRequestResponse({
    description: 'رقم الهاتف غير صحيح أو الحساب غير مفعل',
  })
  async requestPasswordResetOtp(@Body() dto: RequestDoctorPasswordResetDto) {
    return this.DoctorService.requestPasswordResetOtp(dto);
  }

  @Post('forgot-password/verify-otp')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DOCTOR)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'التحقق من رمز OTP (اختياري)',
    description: 'يتحقق من صحة رمز OTP قبل إعادة تعيين كلمة المرور',
  })
  @ApiResponse({
    status: 200,
    description: 'تم التحقق من الرمز بنجاح',
    schema: {
      example: {
        success: true,
        message: 'تم التحقق من الرمز بنجاح',
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'رمز التحقق غير صحيح أو منتهي الصلاحية',
  })
  @ApiNotFoundResponse({
    description: 'لا يوجد حساب طبيب مسجل بهذا الرقم',
  })
  async verifyPasswordResetOtp(@Body() dto: VerifyOtpForPasswordResetDto) {
    return this.DoctorService.verifyPasswordResetOtp(dto);
  }
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DOCTOR)
  @Post('forgot-password/reset')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'إعادة تعيين كلمة المرور',
    description: 'يعيد تعيين كلمة المرور باستخدام رمز التحقق OTP',
  })
  @ApiResponse({
    status: 200,
    description: 'تم إعادة تعيين كلمة المرور بنجاح',
    schema: {
      example: {
        success: true,
        message: 'تم إعادة تعيين كلمة المرور بنجاح',
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'رمز التحقق غير صحيح أو منتهي الصلاحية',
  })
  @ApiNotFoundResponse({
    description: 'لا يوجد حساب طبيب مسجل بهذا الرقم',
  })
  @ApiBadRequestResponse({
    description: 'كلمة المرور الجديدة غير صالحة',
  })
  async resetPassword(@Body() dto: ResetDoctorPasswordDto) {
    return this.DoctorService.resetPassword(dto);
  }
  /**
   * Refresh access token
   */
  @Post('refresh')
  @UseGuards(JwtRefreshGuard, RolesGuard)
  @Roles(UserRole.DOCTOR)
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
  @Get('sessions')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DOCTOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all active sessions for current doctor' })
  async getActiveSessions(@Req() req: any): Promise<{
    doctorId?: string;
    role?: UserRole.DOCTOR;
    sessions?: string[];
    total: number;
  }> {
    const doctorId = req.user.accountId;
    const role = req.user.role;
    const sessions = await this.authService.getActiveSessions(doctorId, role);

    return {
      total: sessions.length,
      sessions,
    };
  }

  /**
   * Logout from current session
   */
  @Post('logout')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DOCTOR)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Logout from current session' })
  async logout(@Req() req: any): Promise<{
    doctorId?: string;
    sessionId?: string;
    message?: string;
  }> {
    const doctorId: string = req.user.accountId;
    const sessionId: string = req.user.sessionId;
    const role: UserRole.DOCTOR = req.user.role;
    await this.authService.logoutSession(doctorId, role, sessionId);

    return {
      message: 'Logged out successfully',
    };
  }

  /**
   * Logout from specific device
   */
  @Post('logout/device/:deviceId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DOCTOR)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Logout from specific device' })
  async logoutDevice(
    @Req() req: any,
    @Param('deviceId') deviceId: string,
  ): Promise<{
    doctorId?: string;
    message?: string;
  }> {
    const doctorId: string = req.user.accountId;
    const role: UserRole.DOCTOR = req.user.role;
    await this.authService.logoutDevice(doctorId, role, deviceId);

    return {
      message: `Logged out from device: ${deviceId}`,
    };
  }

  /**
   * Logout from all devices
   */
  @Post('logout/all')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DOCTOR)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Logout from all devices' })
  async logoutAll(@Req() req: any) {
    const doctorId: string = req.user.accountId;
    const role: UserRole.DOCTOR = req.user.role;
    await this.authService.logoutAllSessions(doctorId, role);

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
  //
  //
  @Get(':doctorId/bookings')
  @ApiOperation({
    summary:
      'Get doctor bookings filtered by slot location and date with pagination',
  })
  @ApiQuery({ name: 'doctorId', required: true, type: String })
  @ApiQuery({
    name: 'locationType',
    required: true,
    enum: ['clinic', 'online'],
  }) // replace with your WorkigEntity enum
  @ApiQuery({
    name: 'bookingDate',
    required: true,
    type: String,
    description: 'YYYY-MM-DD',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Paginated list of bookings' })
  async getDoctorBookingsByLocation(
    @Param('doctorId') doctorId: string,
    @Query() query: GetDoctorBookingsByLocationDto,
  ) {
    // Ensure the DTO doctorId matches the param
    if (query.doctorId && query.doctorId !== doctorId) {
      query.doctorId = doctorId;
    }

    return this.DoctorService.getDoctorBookingsByLocation(query);
  }
}
