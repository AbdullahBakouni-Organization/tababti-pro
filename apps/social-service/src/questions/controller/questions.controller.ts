// import {
//   Controller,
//   Get,
//   Post,
//   Body,
//   Headers,
//   Query,
//   Param,
//   UseGuards,
// } from '@nestjs/common';
// import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

// import { QuestionsService } from '../service/questions.service';
// import { CreateQuestionDto } from '../dto/create-question.dto';
// import { FilterQuestionDto } from '../dto/filter-question.dto';
// import { AnswerQuestionDto } from '../dto/answer-question.dto';
// import { ApiResponse } from '../../common/response/api-response';
// import { CurrentUser } from '../../common/decorators/current-user.decorator';
// import { JwtAuthGuard } from '@app/common/guards/jwt.guard';
// import { RolesGuard } from '@app/common/guards/role.guard';
// import { Roles } from '@app/common/decorator/role.decorator';
// import { UserRole } from '@app/common/database/schemas/common.enums';

// @ApiTags('Questions')
// @ApiBearerAuth()
// @Controller('questions')
// @UseGuards(JwtAuthGuard, RolesGuard)
// export class QuestionsController {
//   constructor(private readonly service: QuestionsService) { }

//   // ── POST / ─────────────────────────────────────────────────────────────────

//   @Post()
//   @Roles(UserRole.USER)
//   async create(
//     @Body() dto: CreateQuestionDto,
//     @CurrentUser('accountId') accountId: string,
//     @Headers('accept-language') lang: 'en' | 'ar' = 'en',
//   ) {
//     const data = await this.service.create(dto, accountId, lang);
//     return ApiResponse.success({ lang, messageKey: 'question.CREATED', data });
//   }

//   // ── GET / ──────────────────────────────────────────────────────────────────
//   // NOTE: /doctor must be declared BEFORE /:questionId so it is not swallowed
//   // by the param route. Keep this ordering intentional.

//   @Get('doctor')
//   @Roles(UserRole.DOCTOR)
//   async getDoctorQuestions(
//     @CurrentUser('accountId') accountId: string,
//     @Query('filter') filter: 'all' | 'specialization' | 'myAnswers' = 'all',
//     @Query('page') page = '1',
//     @Query('limit') limit = '10',
//     @Headers('accept-language') lang: 'en' | 'ar' = 'en',
//   ) {
//     const pageNumber = Math.max(1, parseInt(page, 10));
//     const limitNumber = Math.min(Math.max(1, parseInt(limit, 10)), 50);

//     const data = await this.service.getDoctorQuestions(
//       accountId,
//       filter,
//       pageNumber,
//       limitNumber,
//     );
//     return ApiResponse.success({ lang, messageKey: 'question.LIST', data });
//   }

//   @Get()
//   @Roles(UserRole.USER, UserRole.DOCTOR, UserRole.HOSPITAL, UserRole.CENTER)
//   async getQuestions(
//     @CurrentUser('accountId') accountId: string,
//     @Query() query: FilterQuestionDto,
//     @Query('page') page = '1',
//     @Query('limit') limit = '10',
//     @Headers('accept-language') lang: 'en' | 'ar' = 'en',
//   ) {
//     const pageNumber = Math.max(1, parseInt(page, 10));
//     const limitNumber = Math.min(Math.max(1, parseInt(limit, 10)), 50);

//     const data = await this.service.getQuestions(
//       accountId,
//       query.filter ?? 'allQuestions',
//       query.publicSpecializationId,
//       query.privateSpecializationIds,
//       pageNumber,
//       limitNumber,
//     );
//     return ApiResponse.success({ lang, messageKey: 'question.LIST', data });
//   }

//   // ── POST /:questionId/answer ────────────────────────────────────────────────

//   @Post(':questionId/answer')
//   @Roles(UserRole.DOCTOR, UserRole.HOSPITAL, UserRole.CENTER)
//   async answerQuestion(
//     @Param('questionId') questionId: string,
//     @Body() dto: AnswerQuestionDto,
//     @CurrentUser('accountId') responderId: string,
//     @CurrentUser('role') role: UserRole,
//     @Headers('accept-language') lang: 'en' | 'ar' = 'en',
//   ) {
//     const answer = await this.service.answerQuestion({
//       questionId,
//       responderId,
//       responderType: role,
//       content: dto.content,
//     });
//     return ApiResponse.success({
//       lang,
//       messageKey: 'question.ANSWERED',
//       data: answer,
//     });
//   }
// }

import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Headers,
  Query,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiTags,
  ApiQuery,
  ApiOperation,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';

import { QuestionsService } from '../service/questions.service';
import { CreateQuestionDto } from '../dto/create-question.dto';
import { FilterQuestionDto } from '../dto/filter-question.dto';
import { AnswerQuestionDto } from '../dto/answer-question.dto';
import { ApiResponse } from '../../common/response/api-response';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '@app/common/guards/jwt.guard';
import { RolesGuard } from '@app/common/guards/role.guard';
import { Roles } from '@app/common/decorator/role.decorator';
import { UserRole } from '@app/common/database/schemas/common.enums';

@ApiTags('Questions')
@ApiBearerAuth()
@Controller('questions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class QuestionsController {
  constructor(private readonly service: QuestionsService) {}

  // ─────────────────────────────────────────────────────────────────────────
  // EXISTING ENDPOINTS
  // ─────────────────────────────────────────────────────────────────────────

  @Post()
  @Roles(UserRole.USER)
  @ApiOperation({ summary: 'Create question (text only)' })
  async create(
    @Body() dto: CreateQuestionDto,
    @CurrentUser('accountId') accountId: string,
    @Headers('accept-language') lang: 'en' | 'ar' = 'en',
  ) {
    const data = await this.service.create(dto, accountId, lang);
    return ApiResponse.success({
      lang,
      messageKey: 'question.CREATED',
      data,
    });
  }

  // ── POST / WITH MEDIA ──────────────────────────────────────────────────

  @Post('with-media')
  @Roles(UserRole.USER)
  @UseInterceptors(
    FilesInterceptor('images', 10, {
      limits: { fileSize: 5 * 1024 * 1024 },
      storage: diskStorage({
        destination: (req, file, cb) => {
          const uploadPath = 'uploads/questions';
          cb(null, uploadPath);
        },
        filename: (req, file, cb) => {
          const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1e9);
          cb(null, uniqueName + extname(file.originalname));
        },
      }),
      fileFilter: (req, file, cb) => {
        if (!file.mimetype.match(/\/(jpg|jpeg|png|webp)$/)) {
          return cb(new BadRequestException('Only image files allowed'), false);
        }
        cb(null, true);
      },
    }),
  )
  @ApiOperation({ summary: 'Create question with images' })
  @ApiConsumes('multipart/form-data')
  async createWithMedia(
    @Body() dto: CreateQuestionDto,
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser('accountId') accountId: string,
    @Headers('accept-language') lang: 'en' | 'ar' = 'en',
  ) {
    const data = await this.service.createWithMedia(
      dto,
      files || [],
      accountId,
    );
    return ApiResponse.success({
      lang,
      messageKey: 'question.CREATED',
      data,
    });
  }

  // ── GET / ──────────────────────────────────────────────────────────────

  @Get('doctor')
  @Roles(UserRole.DOCTOR)
  @ApiOperation({ summary: 'Get doctor questions' })
  async getDoctorQuestions(
    @CurrentUser('accountId') accountId: string,
    @Query('filter') filter: 'all' | 'specialization' | 'myAnswers' = 'all',
    @Query('page') page = '1',
    @Query('limit') limit = '10',
    @Headers('accept-language') lang: 'en' | 'ar' = 'en',
  ) {
    const pageNumber = Math.max(1, parseInt(page, 10));
    const limitNumber = Math.min(Math.max(1, parseInt(limit, 10)), 50);

    const data = await this.service.getDoctorQuestions(
      accountId,
      filter,
      pageNumber,
      limitNumber,
    );
    return ApiResponse.success({ lang, messageKey: 'question.LIST', data });
  }

  @Get()
  @Roles(UserRole.USER, UserRole.DOCTOR, UserRole.HOSPITAL, UserRole.CENTER)
  @ApiOperation({ summary: 'Get questions feed' })
  async getQuestions(
    @CurrentUser('accountId') accountId: string,
    @Query() query: FilterQuestionDto,
    @Query('page') page = '1',
    @Query('limit') limit = '10',
    @Headers('accept-language') lang: 'en' | 'ar' = 'en',
  ) {
    const pageNumber = Math.max(1, parseInt(page, 10));
    const limitNumber = Math.min(Math.max(1, parseInt(limit, 10)), 50);

    const data = await this.service.getQuestions(
      accountId,
      query.filter ?? 'allQuestions',
      query.publicSpecializationId,
      query.privateSpecializationIds,
      pageNumber,
      limitNumber,
    );
    return ApiResponse.success({ lang, messageKey: 'question.LIST', data });
  }

  // ── POST /:questionId/answer ──────────────────────────────────────────

  @Post(':questionId/answer')
  @Roles(UserRole.DOCTOR, UserRole.HOSPITAL, UserRole.CENTER)
  @ApiOperation({ summary: 'Answer a question' })
  async answerQuestion(
    @Param('questionId') questionId: string,
    @Body() dto: AnswerQuestionDto,
    @CurrentUser('accountId') responderId: string,
    @CurrentUser('role') role: UserRole,
    @Headers('accept-language') lang: 'en' | 'ar' = 'en',
  ) {
    const answer = await this.service.answerQuestion({
      questionId,
      responderId,
      responderType: role,
      content: dto.content,
    });
    return ApiResponse.success({
      lang,
      messageKey: 'question.ANSWERED',
      data: answer,
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // NEW ENDPOINTS
  // ─────────────────────────────────────────────────────────────────────────

  // ── GET /questions/statistics ──────────────────────────────────────────

  @Get('statistics/all')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Get all questions statistics (Admin)' })
  async getStatistics(@Headers('accept-language') lang: 'en' | 'ar' = 'en') {
    const statistics = await this.service.getStatistics();
    return ApiResponse.success({
      lang,
      messageKey: 'question.STATISTICS',
      data: { statistics },
    });
  }

  // ── GET /questions/doctor/stats ────────────────────────────────────────

  @Get('doctor/stats')
  @Roles(UserRole.DOCTOR)
  @ApiOperation({ summary: 'Get doctor statistics' })
  async getDoctorStatistics(
    @CurrentUser('accountId') doctorId: string,
    @Headers('accept-language') lang: 'en' | 'ar' = 'en',
  ) {
    const statistics = await this.service.getDoctorStatistics(doctorId);
    return ApiResponse.success({
      lang,
      messageKey: 'question.STATISTICS',
      data: { statistics },
    });
  }

  // ── GET /questions/:id/media ───────────────────────────────────────────

  @Get(':id/media')
  @ApiOperation({ summary: 'Get question with media details' })
  async getQuestionWithMedia(
    @Param('id') questionId: string,
    @Headers('accept-language') lang: 'en' | 'ar' = 'en',
  ) {
    const data = await this.service.getQuestionWithMedia(questionId);
    return ApiResponse.success({
      lang,
      messageKey: 'question.FETCHED',
      data,
    });
  }

  // ── POST /questions/:id/approve ────────────────────────────────────────

  @Post(':id/approve')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Approve question (Admin)' })
  async approveQuestion(
    @Param('id') questionId: string,
    @CurrentUser('accountId') adminId: string,
    @Headers('accept-language') lang: 'en' | 'ar' = 'en',
  ) {
    const data = await this.service.approveQuestion(questionId, adminId);
    return ApiResponse.success({
      lang,
      messageKey: 'question.APPROVED',
      data,
    });
  }

  // ── POST /questions/:id/reject ─────────────────────────────────────────

  @Post(':id/reject')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Reject question (Admin)' })
  async rejectQuestion(
    @Param('id') questionId: string,
    @Body() body: { rejectionReason: string },
    @CurrentUser('accountId') adminId: string,
    @Headers('accept-language') lang: 'en' | 'ar' = 'en',
  ) {
    const data = await this.service.rejectQuestion(
      questionId,
      adminId,
      body.rejectionReason,
    );
    return ApiResponse.success({
      lang,
      messageKey: 'question.REJECTED',
      data,
    });
  }

  // ── DELETE /questions/:id ──────────────────────────────────────────────

  @Delete(':id')
  @Roles(UserRole.USER)
  @ApiOperation({ summary: 'Delete own question' })
  async deleteQuestion(
    @Param('id') questionId: string,
    @CurrentUser('accountId') userId: string,
    @Headers('accept-language') lang: 'en' | 'ar' = 'en',
  ) {
    await this.service.deleteQuestion(questionId, userId);
    return ApiResponse.success({
      lang,
      messageKey: 'question.DELETED',
      data: { deleted: true },
    });
  }
}
