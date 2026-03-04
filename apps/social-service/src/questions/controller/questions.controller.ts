import {
  Controller,
  Get,
  Post,
  Body,
  Headers,
  Query,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

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

  // ── POST / ─────────────────────────────────────────────────────────────────

  @Post()
  @Roles(UserRole.USER)
  async create(
    @Body() dto: CreateQuestionDto,
    @CurrentUser('accountId') accountId: string,
    @Headers('accept-language') lang: 'en' | 'ar' = 'en',
  ) {
    const data = await this.service.create(dto, accountId, lang);
    return ApiResponse.success({ lang, messageKey: 'question.CREATED', data });
  }

  // ── GET / ──────────────────────────────────────────────────────────────────
  // NOTE: /doctor must be declared BEFORE /:questionId so it is not swallowed
  // by the param route. Keep this ordering intentional.

  @Get('doctor')
  @Roles(UserRole.DOCTOR)
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

  // ── POST /:questionId/answer ────────────────────────────────────────────────

  @Post(':questionId/answer')
  @Roles(UserRole.DOCTOR, UserRole.HOSPITAL, UserRole.CENTER)
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
}
