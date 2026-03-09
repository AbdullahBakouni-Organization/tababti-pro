import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Headers,
  Query,
  Param,
  UseGuards,
  UploadedFiles,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiBody,
  ApiConsumes,
  ApiHeader,
  ApiQuery,
} from '@nestjs/swagger';
import { FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import * as fs from 'fs';

import { QuestionsService } from '../service/questions.service';
import { CreateQuestionDto } from '../dto/create-question.dto';
import { FilterQuestionDto } from '../dto/filter-question.dto';
import { AnswerQuestionDto } from '../dto/answer-question.dto';
import { ModerateQuestionDto } from '../dto/moderate-question.dto';
import { ApiResponse } from '@app/common/response/api-response';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '@app/common/guards/jwt.guard';
import { JwtUserGuard } from '@app/common/guards/jwt-user.guard';
import { RolesGuard } from '@app/common/guards/role.guard';
import { Roles } from '@app/common/decorator/role.decorator';
import { UserRole } from '@app/common/database/schemas/common.enums';

type Lang = 'en' | 'ar';
function resolveLang(h?: string): Lang {
  return h === 'ar' ? 'ar' : 'en';
}
function parsePage(v = '1') {
  return Math.max(1, parseInt(v, 10));
}
function parseLimit(v = '10') {
  return Math.min(Math.max(1, parseInt(v, 10)), 50);
}

// ── Multer config ─────────────────────────────────────────────────────────────
const questionImagesInterceptor = FilesInterceptor('images', 5, {
  limits: { fileSize: 5 * 1024 * 1024 },
  storage: diskStorage({
    destination: (_req, _file, cb) => {
      const uploadPath = join(process.cwd(), 'uploads', 'questions');
      fs.mkdirSync(uploadPath, { recursive: true });
      cb(null, uploadPath);
    },
    filename: (_req, file, cb) => {
      cb(
        null,
        `${Date.now()}-${Math.round(Math.random() * 1e9)}${extname(file.originalname)}`,
      );
    },
  }),
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.match(/\/(jpg|jpeg|png|webp)$/))
      return cb(new BadRequestException('question.INVALID_FILE_TYPE'), false);
    cb(null, true);
  },
});

@ApiTags('Questions')
@ApiBearerAuth()
@ApiHeader({
  name: 'accept-language',
  description: 'Response language: en | ar',
  required: false,
  schema: { default: 'en', enum: ['en', 'ar'] },
})
@Controller('questions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class QuestionsController {
  constructor(private readonly service: QuestionsService) {}

  // ══════════════════════════════════════════════════════════════════════════
  // POST /questions
  // USER only — text, images, or both (starts as PENDING)
  // ══════════════════════════════════════════════════════════════════════════

  @Post()
  @UseGuards(JwtUserGuard, RolesGuard)
  @Roles(UserRole.USER)
  @ApiOperation({
    summary:
      'Submit a new question — text, images, or both (starts as PENDING)',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['specializationId'],
      properties: {
        content: {
          type: 'string',
          description: 'Question text (required if no images)',
          example: 'What is the best treatment for headache?',
        },
        specializationId: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of private specialization MongoDB IDs',
          example: ['64f1a2b3c4d5e6f7a8b9c0d1'],
        },
        images: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
          description:
            'Image files — jpg, jpeg, png, webp (required if no text)',
        },
      },
    },
  })
  @UseInterceptors(questionImagesInterceptor)
  async create(
    @Body() dto: CreateQuestionDto,
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser('accountId') accountId: string,
    @Headers('accept-language') acceptLanguage?: string,
  ) {
    const lang = resolveLang(acceptLanguage);
    if (files?.length) {
      dto.images = files.map((f) => `uploads/questions/${f.filename}`);
    }
    const data = await this.service.create(dto, accountId, lang);
    return ApiResponse.success({ lang, messageKey: 'question.CREATED', data });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PATCH /questions/:questionId/moderate   (ADMIN only)
  // NOTE: declared before /:questionId routes to avoid collisions
  // ══════════════════════════════════════════════════════════════════════════

  @Patch(':questionId/moderate')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Approve or reject a pending question (ADMIN only)',
    description:
      'Sets status to APPROVED (visible) or REJECTED (hidden). ' +
      'Only PENDING questions can be moderated. Rejection reason is required when rejecting.',
  })
  @ApiParam({
    name: 'questionId',
    description: 'MongoDB ObjectId of the question',
  })
  @ApiBody({ type: ModerateQuestionDto })
  async moderateQuestion(
    @Param('questionId') questionId: string,
    @Body() dto: ModerateQuestionDto,
    @Headers('accept-language') acceptLanguage?: string,
  ) {
    const lang = resolveLang(acceptLanguage);
    const data = await this.service.moderateQuestion(questionId, dto);
    return ApiResponse.success({
      lang,
      messageKey:
        dto.action === 'approve' ? 'question.APPROVED' : 'question.REJECTED',
      data,
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // GET /questions/stats
  // NOTE: static — must be before /:questionId
  // ══════════════════════════════════════════════════════════════════════════

  @Get('stats')
  @Roles(UserRole.DOCTOR, UserRole.HOSPITAL, UserRole.CENTER)
  @ApiOperation({
    summary: 'Question statistics — counts, percentages, by-specialization',
  })
  async getStats(
    @CurrentUser('accountId') accountId: string,
    @CurrentUser('role') role: UserRole,
    @Headers('accept-language') acceptLanguage?: string,
  ) {
    const lang = resolveLang(acceptLanguage);
    const data = await this.service.getStats(accountId, role);
    return ApiResponse.success({ lang, messageKey: 'question.STATS', data });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // GET /questions/doctor
  // NOTE: static — must be before /:questionId
  // ══════════════════════════════════════════════════════════════════════════

  @Get('doctor')
  @Roles(UserRole.DOCTOR)
  @ApiOperation({
    summary: 'Doctor question feed (all / specialization / myAnswers)',
  })
  @ApiQuery({
    name: 'filter',
    required: false,
    enum: ['all', 'specialization', 'myAnswers'],
  })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  async getDoctorQuestions(
    @CurrentUser('accountId') accountId: string,
    @Query('filter') filter: 'all' | 'specialization' | 'myAnswers' = 'all',
    @Query('page') page = '1',
    @Query('limit') limit = '10',
    @Headers('accept-language') acceptLanguage?: string,
  ) {
    const lang = resolveLang(acceptLanguage);
    const data = await this.service.getDoctorQuestions(
      accountId,
      filter,
      parsePage(page),
      parseLimit(limit),
    );
    return ApiResponse.success({ lang, messageKey: 'question.LIST', data });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // GET /questions/by-specialization
  // Filter approved/answered questions by a single private specialization
  // NOTE: static — must be before /:questionId
  // ══════════════════════════════════════════════════════════════════════════

  @Get('by-specialization')
  @Roles(UserRole.USER, UserRole.DOCTOR, UserRole.HOSPITAL, UserRole.CENTER)
  @ApiOperation({
    summary: 'Get questions filtered by a private specialization ID',
    description:
      'Returns approved/answered questions that belong to the given private specialization. ' +
      'Equivalent to GET /questions?privateSpecializationId=<id> but more explicit.',
  })
  @ApiQuery({
    name: 'specializationId',
    required: true,
    type: String,
    description: 'Private specialization MongoDB ObjectId',
    example: '64f1a2b3c4d5e6f7a8b9c0d1',
  })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  async getBySpecialization(
    @CurrentUser('accountId') accountId: string,
    @Query('specializationId') specializationId: string,
    @Query('page') page = '1',
    @Query('limit') limit = '10',
    @Headers('accept-language') acceptLanguage?: string,
  ) {
    const lang = resolveLang(acceptLanguage);

    if (!specializationId)
      throw new BadRequestException('specialization.INVALID_ID');

    const data = await this.service.getQuestions(
      accountId,
      'allQuestions',
      undefined,
      [specializationId],
      parsePage(page),
      parseLimit(limit),
    );
    return ApiResponse.success({ lang, messageKey: 'question.LIST', data });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // GET /questions
  // General feed — only APPROVED + ANSWERED, with optional filters
  // ══════════════════════════════════════════════════════════════════════════

  @Get()
  @Roles(UserRole.USER, UserRole.DOCTOR, UserRole.HOSPITAL, UserRole.CENTER)
  @ApiOperation({
    summary: 'List approved/answered questions with optional filters',
  })
  @ApiQuery({
    name: 'filter',
    required: false,
    enum: ['allQuestions', 'answered', 'pending', 'public'],
  })
  @ApiQuery({
    name: 'publicSpecializationId',
    required: false,
    type: String,
    description: 'Public specialization ID',
  })
  @ApiQuery({
    name: 'privateSpecializationId',
    required: false,
    type: String,
    description: 'Single private specialization ID',
  })
  @ApiQuery({
    name: 'privateSpecializationIds',
    required: false,
    type: [String],
    description: 'Multiple private specialization IDs',
  })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  async getQuestions(
    @CurrentUser('accountId') accountId: string,
    @Query() query: FilterQuestionDto,
    @Query('page') page = '1',
    @Query('limit') limit = '10',
    @Headers('accept-language') acceptLanguage?: string,
  ) {
    const lang = resolveLang(acceptLanguage);

    // Merge privateSpecializationId (single) into privateSpecializationIds (array)
    const privateIds = query.privateSpecializationIds?.length
      ? query.privateSpecializationIds
      : query.privateSpecializationId
        ? [query.privateSpecializationId]
        : undefined;

    const data = await this.service.getQuestions(
      accountId,
      query.filter ?? 'allQuestions',
      query.publicSpecializationId,
      privateIds,
      parsePage(page),
      parseLimit(limit),
    );
    return ApiResponse.success({ lang, messageKey: 'question.LIST', data });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // GET /questions/:questionId
  // ══════════════════════════════════════════════════════════════════════════

  @Get(':questionId')
  @Roles(UserRole.USER, UserRole.DOCTOR, UserRole.HOSPITAL, UserRole.CENTER)
  @ApiOperation({
    summary: 'Get a single question by ID (must be approved or answered)',
  })
  @ApiParam({ name: 'questionId', description: 'MongoDB ObjectId' })
  async getQuestionById(
    @Param('questionId') questionId: string,
    @CurrentUser('accountId') accountId: string,
    @CurrentUser('role') role: UserRole,
    @Headers('accept-language') acceptLanguage?: string,
  ) {
    const lang = resolveLang(acceptLanguage);
    const data = await this.service.getQuestionById(
      questionId,
      accountId,
      role,
    );
    return ApiResponse.success({ lang, messageKey: 'question.FOUND', data });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // POST /questions/:questionId/answer
  // ══════════════════════════════════════════════════════════════════════════

  @Post(':questionId/answer')
  @Roles(UserRole.DOCTOR, UserRole.HOSPITAL, UserRole.CENTER)
  @ApiOperation({
    summary: 'Submit an answer (question must be approved or answered)',
  })
  @ApiParam({ name: 'questionId', description: 'MongoDB ObjectId' })
  @ApiBody({ type: AnswerQuestionDto })
  async answerQuestion(
    @Param('questionId') questionId: string,
    @Body() dto: AnswerQuestionDto,
    @CurrentUser('accountId') responderId: string,
    @CurrentUser('role') role: UserRole,
    @Headers('accept-language') acceptLanguage?: string,
  ) {
    const lang = resolveLang(acceptLanguage);
    const data = await this.service.answerQuestion({
      questionId,
      responderId,
      responderType: role,
      content: dto.content,
    });
    return ApiResponse.success({ lang, messageKey: 'question.ANSWERED', data });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // DELETE /questions/:questionId   (owner USER only)
  // ══════════════════════════════════════════════════════════════════════════

  @Delete(':questionId')
  @Roles(UserRole.USER)
  @ApiOperation({ summary: 'Delete own question (also removes all answers)' })
  @ApiParam({ name: 'questionId', description: 'MongoDB ObjectId' })
  async deleteQuestion(
    @Param('questionId') questionId: string,
    @CurrentUser('accountId') accountId: string,
    @Headers('accept-language') acceptLanguage?: string,
  ) {
    const lang = resolveLang(acceptLanguage);
    await this.service.deleteQuestion(questionId, accountId);
    return ApiResponse.success({
      lang,
      messageKey: 'question.DELETED',
      data: null,
    });
  }
}
