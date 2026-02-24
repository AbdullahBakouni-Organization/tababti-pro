import {
  Controller,
  Get,
  Post,
  Body,
  Headers,
  Query,
  Param,
  UseGuards,
  BadRequestException,
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
@Controller('questions')
export class QuestionsController {
  constructor(private readonly service: QuestionsService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.USER)
  async create(
    @Body() dto: CreateQuestionDto,
    @CurrentUser('accountId') userId: string,
    @Headers('accept-language') lang: 'en' | 'ar' = 'en',
  ) {
    if (!dto.content || !dto.specializationId?.length) {
      throw new BadRequestException('common.VALIDATION_ERROR');
    }

    const data = await this.service.create(dto, userId, lang);

    return ApiResponse.success({
      lang,
      messageKey: 'question.CREATED',
      data,
    });
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DOCTOR, UserRole.HOSPITAL, UserRole.CENTER ,UserRole.USER)
  async getQuestions(
    @CurrentUser('id') userId: string,
    @Query() query: FilterQuestionDto,
    @Headers('accept-language') lang: 'en' | 'ar' = 'en',
  ) {
    const data = await this.service.getQuestions(
      userId,
      query.filter || 'allQuestions',
      query.publicSpecializationId,
      query.privateSpecializationIds,
    );

    return ApiResponse.success({
      lang,
      messageKey: 'question.LIST',
      data,
    });
  }

  @Post(':questionId/answer')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DOCTOR, UserRole.HOSPITAL, UserRole.CENTER)
  async answerQuestion(
    @Param('questionId') questionId: string,
    @Body() dto: AnswerQuestionDto,
    @CurrentUser('accountId') responderId: string,
    @CurrentUser('role') role: UserRole,
    @Headers('accept-language') lang: 'en' | 'ar' = 'en',
  ) {
    if (!dto.content) {
      throw new BadRequestException('common.VALIDATION_ERROR');
    }

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

  @Get('doctor')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DOCTOR)
  async getDoctorQuestions(
    @CurrentUser('accountId') accountId: string,
    @Query('filter') filter: 'all' | 'specialization' | 'myAnswers' = 'all',
    @Headers('accept-language') lang: 'en' | 'ar' = 'en',
  ) {
    const data = await this.service.getDoctorQuestions(accountId, filter);

    return ApiResponse.success({
      lang,
      messageKey: 'question.LIST',
      data,
    });
  }
}
