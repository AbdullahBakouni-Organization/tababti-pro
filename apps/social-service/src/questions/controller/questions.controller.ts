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
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { QuestionsService } from '../service/questions.service';
import { CreateQuestionDto } from '../dto/create-question.dto';
import { FilterQuestionDto } from '../dto/filter-question.dto';
import { AnswerQuestionDto } from '../dto/answer-question.dto';
import { ModerateQuestionDto } from '../dto/moderate-question.dto';
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

  // ══════════════════════════════════════════════════════════════
  // POST /questions
  // Create a new question (USER only).
  // Starts as PENDING — admin must approve before it is visible.
  // ══════════════════════════════════════════════════════════════
  @Post()
  @Roles(UserRole.USER)
  @ApiOperation({ summary: 'Submit a new question (starts as PENDING)' })
  async create(
    @Body() dto: CreateQuestionDto,
    @CurrentUser('accountId') accountId: string,
    @Headers('accept-language') lang: 'en' | 'ar' = 'en',
  ) {
    const data = await this.service.create(dto, accountId, lang);
    return ApiResponse.success({ lang, messageKey: 'question.CREATED', data });
  }

  // ══════════════════════════════════════════════════════════════
  // PATCH /questions/:questionId/moderate
  // Approve or reject a pending question (ADMIN only).
  //
  // NOTE: declared BEFORE /:questionId/answer so NestJS does not
  // misroute PATCH requests to the wrong handler.
  // ══════════════════════════════════════════════════════════════
  @Patch(':questionId/moderate')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Approve or reject a pending question (ADMIN only)',
    description:
      'Sets QuestionStatus to APPROVED (visible in all feeds) or REJECTED (hidden). ' +
      'Only PENDING questions can be moderated. A rejection reason is required when rejecting.',
  })
  @ApiParam({
    name: 'questionId',
    description: 'MongoDB ObjectId of the question',
  })
  @ApiBody({ type: ModerateQuestionDto })
  async moderateQuestion(
    @Param('questionId') questionId: string,
    @Body() dto: ModerateQuestionDto,
    @Headers('accept-language') lang: 'en' | 'ar' = 'en',
  ) {
    const data = await this.service.moderateQuestion(questionId, dto);
    return ApiResponse.success({
      lang,
      messageKey:
        dto.action === 'approve' ? 'question.APPROVED' : 'question.REJECTED',
      data,
    });
  }

  // ══════════════════════════════════════════════════════════════
  // GET /questions/stats
  // NOTE: static segments (/stats, /doctor) MUST be declared before
  // /:questionId so they are never swallowed by the param route.
  // ══════════════════════════════════════════════════════════════
  @Get('stats')
  @Roles(UserRole.DOCTOR, UserRole.HOSPITAL, UserRole.CENTER)
  @ApiOperation({
    summary: 'Question statistics — counts, percentages, by-specialization',
  })
  async getStats(
    @CurrentUser('accountId') accountId: string,
    @CurrentUser('role') role: UserRole,
    @Headers('accept-language') lang: 'en' | 'ar' = 'en',
  ) {
    const data = await this.service.getStats(accountId, role);
    return ApiResponse.success({ lang, messageKey: 'question.STATS', data });
  }

  // ══════════════════════════════════════════════════════════════
  // GET /questions/doctor
  // Doctor-specific feed (only APPROVED + ANSWERED questions).
  // ══════════════════════════════════════════════════════════════
  @Get('doctor')
  @Roles(UserRole.DOCTOR)
  @ApiOperation({
    summary: 'Doctor question feed (all / specialization / myAnswers)',
  })
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

  // ══════════════════════════════════════════════════════════════
  // GET /questions
  // General feed — only APPROVED + ANSWERED questions visible.
  // ══════════════════════════════════════════════════════════════
  @Get()
  @Roles(UserRole.USER, UserRole.DOCTOR, UserRole.HOSPITAL, UserRole.CENTER)
  @ApiOperation({
    summary: 'List approved/answered questions with optional filters',
  })
  async getQuestions(
    @CurrentUser('accountId') accountId: string,
    @CurrentUser('role') role: UserRole,
    @Query() query: FilterQuestionDto,
    @Query('page') page = '1',
    @Query('limit') limit = '10',
  ) {
    const pageNumber = Math.max(1, parseInt(page, 10));
    const limitNumber = Math.min(Math.max(1, parseInt(limit, 10)), 50);
    const data = await this.service.getQuestions(
      query.filter ?? 'main',
      accountId,
      role,
      query.privateSpecializationIds,
      pageNumber,
      limitNumber,
    );
    return data;
  }

  // ══════════════════════════════════════════════════════════════
  // GET /questions/:questionId
  // Returns a single question — only if APPROVED or ANSWERED.
  // ══════════════════════════════════════════════════════════════
  @Get(':questionId')
  @Roles(UserRole.USER, UserRole.DOCTOR, UserRole.HOSPITAL, UserRole.CENTER)
  @ApiOperation({
    summary: 'Get a single question by ID (must be approved or answered)',
  })
  async getQuestionById(
    @Param('questionId') questionId: string,
    @CurrentUser('accountId') accountId: string,
    @CurrentUser('role') role: UserRole,
    @Headers('accept-language') lang: 'en' | 'ar' = 'en',
  ) {
    const data = await this.service.getQuestionById(
      questionId,
      accountId,
      role,
    );
    return ApiResponse.success({ lang, messageKey: 'question.FOUND', data });
  }

  // ══════════════════════════════════════════════════════════════
  // POST /questions/:questionId/answer
  // Answer a question — only if APPROVED or ANSWERED.
  // ══════════════════════════════════════════════════════════════
  @Post(':questionId/answer')
  @Roles(UserRole.DOCTOR, UserRole.HOSPITAL, UserRole.CENTER)
  @ApiOperation({
    summary: 'Submit an answer (question must be approved or answered)',
  })
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

  // ══════════════════════════════════════════════════════════════
  // DELETE /questions/:questionId
  // Soft-delete by owner only.
  // ══════════════════════════════════════════════════════════════
  @Delete(':questionId')
  @Roles(UserRole.USER)
  @ApiOperation({ summary: 'Delete own question (also removes all answers)' })
  async deleteQuestion(
    @Param('questionId') questionId: string,
    @CurrentUser('accountId') accountId: string,
    @Headers('accept-language') lang: 'en' | 'ar' = 'en',
  ) {
    await this.service.deleteQuestion(questionId, accountId);
    return ApiResponse.success({
      lang,
      messageKey: 'question.DELETED',
      data: null,
    });
  }
}
