import {
  Controller,
  Get,
  Post,
  Body,
  Headers,
  Query,
  UseGuards,
  InternalServerErrorException,
  Param,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { QuestionsService } from '../service/questions.service';
import { CreateQuestionDto } from '../dto/create-question.dto';
import { FilterQuestionDto } from '../dto/filter-question.dto';
import { ApiResponse } from '../../common/response/api-response';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '@app/common/guards/jwt.guard';
import { RolesGuard } from '@app/common/guards/role.guard';
import { Roles } from '@app/common/decorator/role.decorator';
import { UserRole } from '@app/common/database/schemas/common.enums';
import { AnswerQuestionDto } from '../dto/answer-question.dto';

@ApiTags('Questions')
@Controller('questions')
export class QuestionsController {
  constructor(private readonly service: QuestionsService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.USER)
  @ApiBearerAuth()
  async create(
    @Body() dto: CreateQuestionDto,
    @CurrentUser('id') userId: string,
    @Headers('accept-language') lang: 'en' | 'ar' = 'en',
  ) {
    try {
      const data = await this.service.create(dto, userId);
      return ApiResponse.success({
        lang,
        messageKey: 'question.CREATED',
        data,
      });
    } catch (error) {
      throw error;
    }
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.USER)
  @ApiBearerAuth()
  async getQuestions(
    @CurrentUser('id') userId: string,
    @Query() query: FilterQuestionDto,
    @Headers('accept-language') lang: 'en' | 'ar' = 'en',
  ) {
    try {
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
    } catch (error) {
      throw error;
    }
  }

  @Post(':questionId/answer')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DOCTOR, UserRole.HOSPITAL, UserRole.CENTER)
  @ApiBearerAuth()
  async answerQuestion(
    @Param('questionId') questionId: string,
    @Body() dto: AnswerQuestionDto,
    @CurrentUser('id') responderId: string,
    @CurrentUser('role') role: UserRole,
    @Headers('accept-language') lang: 'en' | 'ar' = 'en',
  ) {
    try {
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
    } catch (error) {
      throw error;
    }
  }
}
