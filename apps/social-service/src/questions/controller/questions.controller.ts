import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Headers,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { QuestionsService } from '../service/questions.service';
import { CreateQuestionDto } from '../dto/create-question.dto';
import { FakeAuthGuard } from '../../common/guards/fake-auth.guard';
import { ApiResponse } from '../../common/response/api-response';
import { STATUS_CODES } from '../../common/constants/status-codes';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Questions')
@Controller('questions')
export class QuestionsController {
  constructor(private readonly service: QuestionsService) {}

  @Post()
  @UseGuards(FakeAuthGuard)
  @ApiBearerAuth()
  async create(
    @Body() dto: CreateQuestionDto,
    @CurrentUser('id') userId: string,
    @Headers('accept-language') lang: 'en' | 'ar' = 'en',
  ) {
    const data = await this.service.create(dto, userId);

    return ApiResponse.success({
      lang,
      messageKey: 'question.CREATED',
      data,
      statusCode: STATUS_CODES.CREATED,
    });
  }

  @Get()
  async findAll(@Headers('accept-language') lang: 'en' | 'ar' = 'en') {
    const data = await this.service.findAll();
    return ApiResponse.success({ lang, messageKey: 'question.LIST', data });
  }

  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @Headers('accept-language') lang: 'en' | 'ar' = 'en',
  ) {
    const data = await this.service.findOne(id);
    return ApiResponse.success({ lang, messageKey: 'question.DETAIL', data });
  }
}
