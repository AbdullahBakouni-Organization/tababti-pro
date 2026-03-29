import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  Res,
  HttpCode,
  HttpStatus,
  Req,
  Patch,
  UnauthorizedException,
  Query,
} from '@nestjs/common';
import { AdminService } from './admin.service';

import { AdminSignInDto } from './dto/admin-signin.dto';

import type { Response } from 'express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
} from '@nestjs/swagger';
import { AuthValidateService, SessionInfo } from '@app/common/auth-validate';
import type { Request } from 'express';
import { JwtAuthGuard } from '@app/common/guards/jwt.guard';
import { RolesGuard } from '@app/common/guards/role.guard';
import { Roles } from '@app/common/decorator/role.decorator';
import {
  GalleryImageStatus,
  PostStatus,
  UserRole,
} from '@app/common/database/schemas/common.enums';
import { JwtAdminRefreshGuard } from '@app/common/guards/jwt-admin-refresh.guard';
import {
  ApprovePostDto,
  GetPostsFilterDto,
  PaginatedPostsResponseDto,
  PostActionResponseDto,
  RejectPostDto,
} from './dto/approved-reject-post.dto';
import { ParseMongoIdPipe } from '@app/common/pipes/parse-mongo-id.pipe';
import { PaginatedQuestionsResponseDto } from './dto/question-response.dto';
import { GetQuestionsFilterDto } from './dto/get-questions.filter.dto';
import { ApproveQuestionsDto } from './dto/approve-questions.dto';
import { RejectQuestionsDto } from './dto/reject-questions.dto';
import {
  DoctorListItemDto,
  PaginatedDoctorsResponseDto,
} from './dto/doctor-response.dto';
import { GetDoctorsFilterDto } from './dto/get-doctors.filter.dto';

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
    res.cookie('admin_token', tokens.refreshToken, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000 * 30,
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
  @UseGuards(JwtAdminRefreshGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token' })
  async refreshToken(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{
    success: boolean;
    accessToken: string;
    refreshToken?: string;
  }> {
    const refreshToken = req.cookies['admin_token'];
    if (!refreshToken) {
      throw new UnauthorizedException('No refresh token found');
    }
    const tokens = await this.authService.refreshAccessToken(refreshToken);
    res.cookie('admin_token', tokens.refreshToken, {
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

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('gallery/pending')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get all pending gallery images',
    description: `
      Retrieve all gallery images awaiting admin approval.

      **Workflow:**
      1. Doctors upload images → Status: PENDING
      2. Admin reviews this endpoint
      3. Admin approves/rejects images
      4. Approved images become visible
      5. Rejected images are deleted from MinIO
      `,
  })
  @ApiResponse({
    status: 200,
    description: 'Pending gallery images retrieved',
    schema: {
      example: [
        {
          doctorId: '507f1f77bcf86cd799439011',
          doctorName: 'Dr. Ahmed Hassan',
          image: {
            imageId: '507f1f77bcf86cd799439025',
            url: 'http://localhost:9000/tababti-doctors/doctors/507f/gallery/uuid.jpg',
            fileName: 'doctors/507f/gallery/uuid.jpg',
            bucket: 'tababti-doctors',
            description: 'Clinic interior',
            uploadedAt: '2026-03-05T10:00:00.000Z',
            status: 'PENDING',
          },
        },
      ],
    },
  })
  async getAllPendingImages(
    @Query('page') page = 1,
    @Query('limit') limit = 20,
  ) {
    return this.adminService.getAllPendingGalleryImages(
      Number(page),
      Number(limit),
    );
  }

  /**
   * Get gallery images for specific doctor (filtered by status)
   */

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get(':doctorId/gallery')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get doctor gallery images',
    description:
      'Get gallery images filtered by status (PENDING, APPROVED, REJECTED)',
  })
  @ApiParam({
    name: 'doctorId',
    description: 'Doctor MongoDB ObjectId',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: GalleryImageStatus,
    description: 'Filter by status',
  })
  @ApiResponse({
    status: 200,
    description: 'Gallery images retrieved',
  })
  async getDoctorGallery(
    @Param('doctorId') doctorId: string,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query('status') status?: GalleryImageStatus,
  ) {
    return this.adminService.getGalleryImages(
      doctorId,
      Number(page),
      Number(limit),
      status,
    );
  }

  /**
   * Approve gallery image
   */

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post(':doctorId/gallery/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Approve gallery image',
    description: `
      Approve a pending gallery image.

      **Effect:**
      - Image status: PENDING → APPROVED
      - Image becomes visible to public
      - Records admin ID and approval timestamp
      `,
  })
  @ApiParam({
    name: 'doctorId',
    description: 'Doctor MongoDB ObjectId',
  })
  @ApiParam({
    name: 'imageId',
    description: 'Unique image ID from gallery',
  })
  @ApiResponse({
    status: 200,
    description: 'Image approved successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Doctor or image not found',
  })
  async approveGalleryImage(
    @Param('doctorId') doctorId: string,
    @Body('imageIds') imageIds: string[],
    @Req() req: any,
  ) {
    const adminId = new ParseMongoIdPipe().transform(
      req.user.entity._id.toString(),
    );
    await this.adminService.approveGalleryImages(doctorId, imageIds, adminId);

    return {
      success: true,
      message: 'Gallery images approved successfully',
      doctorId,
      imageIds,
      approvedBy: adminId,
      approvedAt: new Date(),
    };
  }

  /**
   * Reject and delete gallery image
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post(':doctorId/gallery/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reject gallery image',
    description: `
      Reject a pending gallery image and delete from MinIO.

      **Effect:**
      - Image deleted from MinIO
      - Image removed from doctor's gallery
      - Cannot be recovered
      `,
  })
  @ApiParam({
    name: 'doctorId',
    description: 'Doctor MongoDB ObjectId',
  })
  @ApiParam({
    name: 'imageId',
    description: 'Unique image ID from gallery',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        reason: {
          type: 'string',
          example: 'Image did not meet quality standards',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Image rejected and deleted',
  })
  async rejectGalleryImage(
    @Param('doctorId') doctorId: string,
    @Body('imageIds') imageIds: string[],
    @Body('reason') reason: string,
    @Req() req: any,
  ) {
    const adminId = new ParseMongoIdPipe().transform(
      req.user.entity._id.toString(),
    );
    if (!reason) {
      reason = 'Image did not meet quality standards';
    }

    await this.adminService.rejectGalleryImages(
      doctorId,
      imageIds,
      reason,
      adminId,
    );

    return {
      success: true,
      message: 'Gallery images rejected and deleted',
      doctorId,
      imageIds,
      reason,
      rejectedBy: adminId,
      rejectedAt: new Date(),
    };
  }

  /**
   * Get all pending posts
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('posts/pending')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get all pending posts',
    description: `
      Retrieve all posts awaiting admin approval.
      Supports filtering by doctor name (Arabic/English).

      **Features:**
      - Powerful regex search for doctor names
      - Supports Arabic: أحمد، محمد، علي
      - Supports English: Ahmed, Mohammed, Ali
      - Case-insensitive search
      - Partial name matching
      - Pagination support
      `,
  })
  @ApiResponse({
    status: 200,
    description: 'Pending posts retrieved',
    type: PaginatedPostsResponseDto,
  })
  async getPendingPosts(
    @Query() filters: GetPostsFilterDto,
  ): Promise<PaginatedPostsResponseDto> {
    // Force status to PENDING
    filters.status = PostStatus.PENDING;
    return this.adminService.getPosts(filters);
  }

  /**
   * Get all approved posts
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('posts/approved-posts')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get all approved posts',
    description: 'Retrieve all approved posts with doctor name filtering.',
  })
  @ApiResponse({
    status: 200,
    description: 'Approved posts retrieved',
    type: PaginatedPostsResponseDto,
  })
  async getApprovedPosts(
    @Query() filters: GetPostsFilterDto,
  ): Promise<PaginatedPostsResponseDto> {
    // Force status to APPROVED
    filters.status = PostStatus.APPROVED;
    return this.adminService.getPosts(filters);
  }

  /**
   * Get all rejected posts
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('posts/rejected-posts')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get all rejected posts',
    description: 'Retrieve all rejected posts with doctor name filtering.',
  })
  @ApiResponse({
    status: 200,
    description: 'Rejected posts retrieved',
    type: PaginatedPostsResponseDto,
  })
  async getRejectedPosts(
    @Query() filters: GetPostsFilterDto,
  ): Promise<PaginatedPostsResponseDto> {
    // Force status to REJECTED
    filters.status = PostStatus.REJECTED;
    return this.adminService.getPosts(filters);
  }

  /**
   * Get all posts with flexible filtering
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('posts/all-posts')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get all posts with filters',
    description: `
      Get posts with advanced filtering options.

      **Query Parameters:**
      - status: Filter by PENDING, APPROVED, or REJECTED (optional)
      - doctorName: Search by doctor name in Arabic or English (optional)
      - page: Page number (default: 1)
      - limit: Items per page (default: 20, max: 100)

      **Doctor Name Search Examples:**
      - Arabic: "أحمد" → matches "أحمد حسن", "أحمد علي"
      - English: "Ahmed" → matches "Ahmed Hassan", "Ahmed Ali"
      - Partial: "أح" → matches any name starting with "أح"
      - Full name: "أحمد حسن" → matches exact full name

      **Features:**
      - Powerful regex for both Arabic and English
      - Case-insensitive search
      - Searches firstName, lastName, and full name
      - Unicode-aware (proper Arabic support)
      `,
  })
  @ApiResponse({
    status: 200,
    description: 'Posts retrieved successfully',
    type: PaginatedPostsResponseDto,
    schema: {
      example: {
        posts: [
          {
            postId: '507f1f77bcf86cd799439020',
            content: 'Important health tips...',
            title: 'Summer Health Tips',
            images: [
              'http://localhost:9000/tababti-general/posts/507f/post123/uuid.jpg',
            ],
            status: 'PENDING',
            doctor: {
              doctorId: '507f1f77bcf86cd799439011',
              firstName: 'أحمد',
              lastName: 'حسن',
              fullName: 'أحمد حسن',
              specialization: 'Cardiology',
              image: 'http://localhost:9000/.../profile/uuid.jpg',
            },
            createdAt: '2026-03-05T10:00:00.000Z',
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
          totalPending: 45,
          totalApproved: 120,
          totalRejected: 15,
        },
      },
    },
  })
  async getAllPosts(
    @Query() filters: GetPostsFilterDto,
  ): Promise<PaginatedPostsResponseDto> {
    return this.adminService.getPosts(filters);
  }

  /**
   * Approve post
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post(':postId/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Approve post',
    description: `
      Approve a pending post.

      **Effect:**
      - Post status: PENDING → APPROVED
      - Post becomes visible to public
      - Doctor receives FCM notification via Kafka
      - Records admin ID and approval timestamp
      `,
  })
  @ApiParam({
    name: 'postId',
    description: 'Post MongoDB ObjectId',
  })
  @ApiResponse({
    status: 200,
    description: 'Post approved successfully',
    type: PostActionResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Post not found or already processed',
  })
  async approvePost(
    @Param('postId') postId: string,
    @Body() dto: ApprovePostDto,
    @Req() req: any,
  ): Promise<PostActionResponseDto> {
    const adminId = new ParseMongoIdPipe().transform(
      req.user.entity._id.toString(),
    );
    return this.adminService.approvePost(postId, dto, adminId);
  }

  /**
   * Reject post
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post(':postId/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reject post',
    description: `
      Reject a pending post.

      **Effect:**
      - Post status: PENDING → REJECTED
      - Post NOT visible to public
      - Doctor receives FCM notification with rejection reason
      - Records admin ID, rejection timestamp, and reason

      **Note:** Rejected posts are kept in database for audit trail.
      `,
  })
  @ApiParam({
    name: 'postId',
    description: 'Post MongoDB ObjectId',
  })
  @ApiResponse({
    status: 200,
    description: 'Post rejected successfully',
    type: PostActionResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Rejection reason is required',
  })
  @ApiResponse({
    status: 404,
    description: 'Post not found or already processed',
  })
  async rejectPost(
    @Param('postId') postId: string,
    @Body() dto: RejectPostDto,
    @Req() req: any,
  ): Promise<PostActionResponseDto> {
    const adminId = new ParseMongoIdPipe().transform(
      req.user.entity._id.toString(),
    );
    return this.adminService.rejectPost(postId, dto, adminId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('all-questions')
  @ApiOperation({ summary: 'Get all questions with optional status filter' })
  @ApiResponse({ status: 200, type: PaginatedQuestionsResponseDto })
  async getQuestions(@Query() filters: GetQuestionsFilterDto) {
    return this.adminService.getQuestions(filters);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post('approve-questions')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Approve questions',
    description: `
        Approve one or more user questions.
        **Effect:**
        - approvalStatus: draft → approved
        - Question becomes visible to doctors
        - User receives FCM notification
      `,
  })
  @ApiBody({ type: ApproveQuestionsDto })
  @ApiResponse({ status: 200, description: 'Questions approved successfully' })
  @ApiResponse({ status: 404, description: 'No matching questions found' })
  async approveQuestions(@Body() dto: ApproveQuestionsDto, @Req() req: any) {
    const adminId = new ParseMongoIdPipe().transform(
      req.user.entity._id.toString(),
    );
    await this.adminService.approveQuestions(dto.questionIds, adminId);
    return {
      success: true,
      message: `${dto.questionIds.length} question(s) approved successfully`,
      questionIds: dto.questionIds,
      approvedBy: adminId,
      approvedAt: new Date(),
    };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post('reject-questions')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reject questions',
    description: `
        Reject one or more user questions with a reason.
        **Effect:**
        - approvalStatus: draft → rejected
        - Rejection reason is stored
        - User receives FCM notification with reason
      `,
  })
  @ApiBody({ type: RejectQuestionsDto })
  @ApiResponse({ status: 200, description: 'Questions rejected successfully' })
  @ApiResponse({ status: 404, description: 'No matching questions found' })
  async rejectQuestions(@Body() dto: RejectQuestionsDto, @Req() req: any) {
    const adminId = new ParseMongoIdPipe().transform(
      req.user.entity._id.toString(),
    );
    await this.adminService.rejectQuestions(
      dto.questionIds,
      dto.reason,
      adminId,
    );
    return {
      success: true,
      message: `${dto.questionIds.length} question(s) rejected successfully`,
      questionIds: dto.questionIds,
      reason: dto.reason,
      rejectedBy: adminId,
      rejectedAt: new Date(),
    };
  }
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('doctors')
  @ApiOperation({
    summary: 'Get all doctors',
    description: `
      Returns paginated list of doctors with optional filters.
      **Filters:**
      - approvalStatus: pending | draft | approved | rejected | suspended | active | deleted
      - name: search by first or last name (Arabic/English)
      - specializationId: filter by specialization MongoDB ObjectId
    `,
  })
  @ApiResponse({ status: 200, type: PaginatedDoctorsResponseDto })
  async getDoctors(@Query() filters: GetDoctorsFilterDto) {
    return this.adminService.getDoctors(filters);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('doctors/:doctorId')
  @ApiOperation({
    summary: 'Get doctor by ID',
    description: 'Returns full doctor profile by MongoDB ObjectId.',
  })
  @ApiParam({ name: 'doctorId', description: 'Doctor MongoDB ObjectId' })
  @ApiResponse({ status: 200, type: DoctorListItemDto })
  @ApiResponse({ status: 404, description: 'Doctor not found' })
  @ApiResponse({ status: 400, description: 'Invalid doctor ID' })
  async getDoctorById(@Param('doctorId') doctorId: string) {
    return this.adminService.getDoctorById(doctorId);
  }
}
