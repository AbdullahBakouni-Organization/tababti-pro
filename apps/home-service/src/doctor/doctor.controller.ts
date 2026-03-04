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
  Patch,
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
  ApiParam,
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
import {
  BookingStatus,
  UserRole,
} from '@app/common/database/schemas/common.enums';
import { Roles } from '@app/common/decorator/role.decorator';
import { DoctorLoginDto } from './dto/login.dto';
import {
  RequestDoctorPasswordResetDto,
  ResetDoctorPasswordDto,
  VerifyOtpForPasswordResetDto,
} from './dto/doctor-forgot-password.dto';
import {
  DoctorCancelBookingDto,
  PauseSlotConflictDto,
  PauseSlotsDto,
} from './dto/slot-management.dto';
import {
  AllSlotsResponseDto,
  CheckHolidayConflictDto,
  CheckVIPBookingConflictDto,
  CreateHolidayDto,
  CreateVIPBookingDto,
  GetAllSlotsDto,
  HolidayConflictResponseDto,
  VIPBookingConflictResponseDto,
} from './dto/vibbooking.dto';
import { CheckDoctorByPhoneDto } from './dto/check-doctor-by-phone.dto';
import { UpdateFCMTokenDto } from './dto/update-fcm.dto';
import {
  BookingCompletionResponseDto,
  DoctorCompleteBookingDto,
} from './dto/complete-booking.dto';

import { DoctorPatientStatsDto } from './dto/doctor-patient-stats.dto';
import {
  GetDoctorBookingsDto,
  GetDoctorBookingsResponseDto,
} from './dto/get-doctor-booking.dto';
import { DoctorBookingsQueryService } from './doctor.service.v2';
import { RescheduleBookingDto } from './dto/resechedula-booking.dto,';
import { ParseMongoIdPipe } from '../../../../libs/common/src/pipes/parse-mongo-id.pipe';
import { Throttle } from '@nestjs/throttler';

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
    private DoctorServiceV2: DoctorBookingsQueryService,
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
    Work;
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
    console.log(tokens.accessToken);
    console.log(tokens.refreshToken);
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
  @Throttle({ default: { limit: 3, ttl: 60 } })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DOCTOR)
  @Post('forgot-password/request-otp')
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

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DOCTOR)
  @Post('forgot-password/verify-otp')
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

  @UseGuards(JwtRefreshGuard, RolesGuard)
  @Roles(UserRole.DOCTOR)
  @Post('refresh')
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

  // @Get(':doctorId/bookings')
  // @ApiOperation({
  //   summary:
  //     'Get doctor bookings filtered by slot location and date with pagination',
  // })
  // @ApiQuery({ name: 'doctorId', required: true, type: String })
  // @ApiQuery({
  //   name: 'locationType',
  //   required: true,
  //   enum: ['clinic', 'online'],
  // }) // replace with your WorkigEntity enum
  // @ApiQuery({
  //   name: 'bookingDate',
  //   required: true,
  //   type: String,
  //   description: 'YYYY-MM-DD',
  // })
  // @ApiQuery({ name: 'page', required: false, type: Number })
  // @ApiQuery({ name: 'limit', required: false, type: Number })
  // @ApiResponse({ status: 200, description: 'Paginated list of bookings' })
  // async getDoctorBookingsByLocation(
  //   @Param('doctorId') doctorId: string,
  //   @Query() query: GetDoctorBookingsByLocationDto,
  // ) {
  //   // Ensure the DTO doctorId matches the param
  //   if (query.doctorId && query.doctorId !== doctorId) {
  //     query.doctorId = doctorId;
  //   }

  //   return this.DoctorService.getDoctorBookingsByLocation(query);
  // }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DOCTOR)
  @Post('cancel-booking')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Doctor cancels a booking',
    description:
      'Allows doctor to cancel a patient booking. The slot is automatically freed and becomes available again. A Kafka event is published to refresh the available slots list, and the patient receives an FCM push notification.',
  })
  @ApiResponse({
    status: 200,
    description: 'Booking cancelled and slot freed successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Booking not found or already cancelled',
  })
  async cancelBooking(@Body() dto: DoctorCancelBookingDto, @Req() req: any) {
    const doctorId = new ParseMongoIdPipe().transform(
      req.user.entity._id.toString(),
    );
    return this.DoctorService.doctorCancelBooking(dto, doctorId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DOCTOR)
  @Post('pause/check-conflicts')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Check conflicts before pausing slots (Dry Run)',
    description:
      'Preview which bookings will be affected if the specified slots are paused. No changes are made to the database.',
  })
  @ApiResponse({
    status: 200,
    description: 'Conflict check completed',
    type: PauseSlotConflictDto,
  })
  async checkPauseConflicts(
    @Body() dto: PauseSlotsDto,
    @Req() req: any,
  ): Promise<PauseSlotConflictDto> {
    const doctorId = new ParseMongoIdPipe().transform(
      req.user.entity._id.toString(),
    );
    return this.DoctorService.checkPauseConflicts(dto, doctorId);
  }

  /**
   * Pause slots (execute)
   * This pauses slots for ONE DAY ONLY (today or specified date)
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DOCTOR)
  @Post('pause')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Pause appointment slots',
    description:
      'Pauses specified slots for ONE DAY (today or specified date). Any existing bookings for these slots will be cancelled, and patients will receive FCM push notifications. Requires confirmPause: true if conflicts exist.',
  })
  @ApiResponse({
    status: 200,
    description: 'Slots are being paused. Job queued.',
  })
  @ApiResponse({
    status: 409,
    description: 'Conflicts exist but not confirmed',
  })
  @ApiResponse({
    status: 404,
    description: 'Doctor or slots not found',
  })
  async pauseSlots(@Body() dto: PauseSlotsDto, @Req() req: any) {
    const doctorId = new ParseMongoIdPipe().transform(
      req.user.entity._id.toString(),
    );
    return this.DoctorService.pauseSlots(dto, doctorId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DOCTOR)
  @Get('slots/all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get ALL slots including booked ones (for VIP booking)',
    description:
      'Returns all slots for a specific date, including BOOKED slots with existing patient info. Use this for doctor to see all slots before creating VIP booking.',
  })
  @ApiResponse({
    status: 200,
    description: 'All slots retrieved',
    type: [AllSlotsResponseDto],
  })
  async getAllSlots(
    @Query() query: GetAllSlotsDto,
  ): Promise<AllSlotsResponseDto[]> {
    return this.DoctorService.getAllSlots(query);
  }

  /**
   * Check VIP booking conflict (dry run)
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DOCTOR)
  @Post('vip-booking/check-conflict')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Check VIP booking conflict (Dry Run)',
    description:
      'Check if creating a VIP booking will displace an existing booking. Returns details of the existing booking if slot is occupied.',
  })
  @ApiResponse({
    status: 200,
    description: 'Conflict check completed',
    type: VIPBookingConflictResponseDto,
  })
  async checkVIPBookingConflict(
    @Body() dto: CheckVIPBookingConflictDto,
    @Req() req: any,
  ): Promise<VIPBookingConflictResponseDto> {
    const doctorId = new ParseMongoIdPipe().transform(
      req.user.entity._id.toString(),
    );
    return this.DoctorService.checkVIPBookingConflict(dto, doctorId);
  }

  /**
   * Create VIP booking (confirmed)
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DOCTOR)
  @Post('vip-booking')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Create VIP booking',
    description:
      'Creates a VIP booking. If slot is already booked, the existing booking will be CANCELLED and patient will be notified via FCM push notification. Requires confirmOverride: true if slot is occupied.',
  })
  @ApiResponse({
    status: 200,
    description: 'VIP booking job queued',
  })
  @ApiResponse({
    status: 409,
    description: 'Slot is booked but not confirmed',
  })
  async createVIPBooking(@Body() dto: CreateVIPBookingDto, @Req() req: any) {
    const doctorId = new ParseMongoIdPipe().transform(
      req.user.entity._id.toString(),
    );
    return this.DoctorService.createVIPBooking(dto, doctorId);
  }

  /* ==========================================================================
      SCENARIO 2: HOLIDAY BLOCKING ROUTES
   ========================================================================== */

  /**
   * Check holiday conflicts (dry run)
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DOCTOR)
  @Post('holidays/check-conflict')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Check holiday conflicts (Dry Run)',
    description:
      'Check which bookings will be affected if doctor takes holiday during specified dates. Returns list of all PENDING bookings that will be cancelled.',
  })
  @ApiResponse({
    status: 200,
    description: 'Conflict check completed',
    type: HolidayConflictResponseDto,
  })
  async checkHolidayConflict(
    @Body() dto: CheckHolidayConflictDto,
    @Req() req: any,
  ): Promise<HolidayConflictResponseDto> {
    const doctorId = new ParseMongoIdPipe().transform(
      req.user.entity._id.toString(),
    );
    return this.DoctorService.checkHolidayConflict(dto, doctorId);
  }

  /**
   * Create holiday (confirmed)
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DOCTOR)
  @Post('holidays')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Create doctor holiday',
    description:
      'Blocks all slots in the date range and cancels all PENDING bookings. All affected patients receive PERSONALIZED FCM push notifications with their specific appointment details. Requires confirmHoliday: true if bookings exist.',
  })
  @ApiResponse({
    status: 200,
    description: 'Holiday blocking job queued',
  })
  @ApiResponse({
    status: 409,
    description: 'Bookings exist but not confirmed',
  })
  async createHoliday(@Body() dto: CreateHolidayDto, @Req() req: any) {
    const doctorId = new ParseMongoIdPipe().transform(
      req.user.entity._id.toString(),
    );
    return this.DoctorService.createHoliday(dto, doctorId);
  }

  /**
   * Check doctor by phone
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DOCTOR)
  @Post('check-by-phone')
  async checkDoctorByPhone(
    @Body() dto: CheckDoctorByPhoneDto,
  ): Promise<{ exists: boolean; approved: boolean }> {
    const exists = await this.DoctorService.isApprovedDoctorByPhone(dto.phone);

    return exists;
  }

  /**
   * Update doctor FCM token
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DOCTOR)
  @Post('fcm-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Update doctor FCM token',
    description: 'Updates the FCM token for the specified doctor.',
  })
  @ApiResponse({
    status: 200,
    description: 'FCM token updated successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid doctor ID or FCM token',
  })
  @ApiResponse({
    status: 404,
    description: 'Doctor not found',
  })
  async updateDoctorFCMToken(@Body() dto: UpdateFCMTokenDto, @Req() req: any) {
    const doctorId = new ParseMongoIdPipe().transform(
      req.user.entity._id.toString(),
    );
    return this.DoctorService.updateDoctorFCMToken(doctorId, dto.fcmToken);
  }
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DOCTOR)
  @Post('complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Doctor completes a booking',
    description:
      'Marks booking as completed. Patient receives FCM notification via Kafka event.',
  })
  @ApiResponse({
    status: 200,
    description: 'Booking completed successfully',
    type: BookingCompletionResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Booking not found or already completed',
  })
  async completeBooking(
    @Body() dto: DoctorCompleteBookingDto,
    @Req() req: any,
  ): Promise<BookingCompletionResponseDto> {
    const doctorId = new ParseMongoIdPipe().transform(
      req.user.entity._id.toString(),
    );
    return this.DoctorService.completeBooking(dto, doctorId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DOCTOR)
  @Get('stats/patients/gender')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DOCTOR)
  @ApiBearerAuth()
  async getPatientGenderStats(@Req() req: any): Promise<DoctorPatientStatsDto> {
    const doctorId = new ParseMongoIdPipe().transform(
      req.user.entity._id.toString(),
    );
    return this.DoctorService.getDoctorPatientGenderStats(doctorId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DOCTOR)
  @Patch('reschedule')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Mark booking as rescheduled',
    description: `
       Doctor marks a booking as rescheduled.
       - Booking status → **RESCHEDULED**
       - Slot status → **AVAILABLE** (freed for other patients)
       - Patient receives a Kafka cancellation notification
       - Only **PENDING** or **NEEDS_RESCHEDULE** bookings can be rescheduled
     `,
  })
  @ApiResponse({
    status: 200,
    description: 'Booking rescheduled successfully',
    schema: {
      example: {
        message: 'Booking marked as rescheduled and slot is now available',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid booking status' })
  @ApiResponse({
    status: 403,
    description: 'Booking does not belong to this doctor',
  })
  @ApiResponse({ status: 404, description: 'Booking not found' })
  async rescheduleBooking(@Body() dto: RescheduleBookingDto, @Req() req: any) {
    return this.DoctorServiceV2.rescheduleBooking(
      req.user.entity._id.toString(),
      dto,
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DOCTOR)
  @Get('bookings')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get doctor bookings with advanced filters',
    description: `
       Retrieves doctor's bookings with comprehensive filtering and sorting capabilities.

       **Features:**
       - Filter by date (specific date or date range)
       - Filter by status (single or multiple statuses)
       - Filter by location (entity name or type)
       - Sorted by inspection time (ascending)
       - Includes full patient and slot information
       - Pagination support
       - Response is cached for 5 minutes

       **Sorting:**
       Bookings are automatically sorted by inspection time from earliest to latest based on doctor's inspection duration.

       **Caching:**
       Results are cached for 5 minutes. Cache key includes all filter parameters.
     `,
  })
  @ApiParam({
    name: 'doctorId',
    description: 'Doctor MongoDB ObjectId',
    example: '507f1f77bcf86cd799439010',
  })
  @ApiQuery({
    name: 'date',
    required: false,
    description: 'Filter by specific date (YYYY-MM-DD)',
    example: '2026-02-25',
  })
  @ApiQuery({
    name: 'startDate',
    required: false,
    description: 'Start date for range filter (YYYY-MM-DD)',
    example: '2026-02-20',
  })
  @ApiQuery({
    name: 'endDate',
    required: false,
    description: 'End date for range filter (YYYY-MM-DD)',
    example: '2026-02-28',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    description:
      'Filter by status (can specify multiple by repeating parameter)',
    enum: BookingStatus,
    isArray: true,
    example: ['PENDING', 'CONFIRMED'],
  })
  @ApiQuery({
    name: 'locationEntityName',
    required: false,
    description: 'Filter by location entity name (hospital/clinic name)',
    example: 'City Medical Center',
  })
  @ApiQuery({
    name: 'locationType',
    required: false,
    description: 'Filter by location type',
    example: 'HOSPITAL',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    description: 'Page number',
    example: 1,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Items per page',
    example: 20,
  })
  @ApiResponse({
    status: 200,
    description: 'Bookings retrieved successfully',
    type: GetDoctorBookingsResponseDto,
    schema: {
      example: {
        bookings: [
          {
            bookingId: '507f1f77bcf86cd799439015',
            status: 'CONFIRMED',
            bookingDate: '2026-02-25T00:00:00.000Z',
            bookingTime: '09:00',
            bookingEndTime: '09:30',
            inspectionDuration: 30,
            price: 150,
            note: 'Regular checkup',
            createdAt: '2026-02-20T10:00:00.000Z',
            patient: {
              patientId: '507f1f77bcf86cd799439011',
              firstName: 'Ahmed',
              lastName: 'Hassan',
              username: 'ahmed.hassan',
              phoneNumber: '+966501234567',
              email: 'ahmed@example.com',
              dateOfBirth: '1990-05-15T00:00:00.000Z',
              gender: 'MALE',
            },
            slot: {
              slotId: '507f1f77bcf86cd799439020',
              date: '2026-02-25T00:00:00.000Z',
              startTime: '09:00',
              endTime: '09:30',
              status: 'BOOKED',
              location: {
                type: 'HOSPITAL',
                entity_name: 'City Medical Center',
                address: '123 Main St',
                city: 'Riyadh',
                coordinates: {
                  latitude: 24.7136,
                  longitude: 46.6753,
                },
              },
            },
          },
        ],
        pagination: {
          currentPage: 1,
          totalPages: 5,
          totalItems: 100,
          itemsPerPage: 20,
          hasNextPage: true,
          hasPreviousPage: false,
        },
        summary: {
          totalBookings: 100,
          byStatus: {
            PENDING: 30,
            CONFIRMED: 45,
            COMPLETED: 20,
            CANCELLED: 5,
          },
          averageDuration: 30,
          totalRevenue: 15000,
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid doctor ID or query parameters',
  })
  @ApiResponse({
    status: 404,
    description: 'Doctor not found',
  })
  async getDoctorBookings(
    @Query() query: GetDoctorBookingsDto,
    @Req() req: any,
  ): Promise<GetDoctorBookingsResponseDto> {
    // Merge doctorId from path param
    const doctorId = new ParseMongoIdPipe().transform(
      req.user.entity._id.toString(),
    );
    const dto: GetDoctorBookingsDto = {
      ...query,
    };
    return this.DoctorServiceV2.getDoctorBookings(dto, doctorId);
  }
}
