import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Headers,
  UseGuards,
  Req,
} from '@nestjs/common';
import { QuestionsService } from '../service/questions.service';
import { CreateQuestionDto } from '../dto/create-question.dto';
import { ApiResponse } from '../../common/response/api-response';
import { STATUS_CODES } from '../../common/constants/status-codes';
import { JwtAuthGuard } from '@app/common/guards/jwt.guard';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

@ApiTags('Questions')
@Controller('questions')
export class QuestionsController {
  constructor(private readonly service: QuestionsService) {}

  // 🔐 CREATE QUESTION (Protected)
  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async create(
    @Body() dto: CreateQuestionDto,
    @Req() req: any,
    @Headers('accept-language') lang: 'en' | 'ar' = 'en',
  ) {
    const userId = req.user.id; // 👈 من التوكن

    const data = await this.service.create(dto, userId);

    return ApiResponse.success({
      lang,
      messageKey: 'question.CREATED',
      data,
      statusCode: STATUS_CODES.CREATED,
    });
  }

  // 🌍 PUBLIC - LIST QUESTIONS
  @Get()
  async findAll(@Headers('accept-language') lang: 'en' | 'ar' = 'en') {
    const data = await this.service.findAll();

    return ApiResponse.success({
      lang,
      messageKey: 'question.LIST',
      data,
    });
  }

  // 🌍 PUBLIC - QUESTION DETAILS
  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @Headers('accept-language') lang: 'en' | 'ar' = 'en',
  ) {
    const data = await this.service.findOne(id);

    return ApiResponse.success({
      lang,
      messageKey: 'question.DETAIL',
      data,
    });
  }
}
