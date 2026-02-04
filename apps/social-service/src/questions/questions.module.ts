import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { QuestionsController } from './controller/questions.controller';
import { QuestionsService } from './service/questions.service';
import { QuestionsRepository } from './repository/questions.repository';
import {
  Question,
  QuestionSchema,
} from '../../../../libs/common/src/database/schemas/question.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Question.name, schema: QuestionSchema },
    ]),
  ],
  controllers: [QuestionsController],
  providers: [QuestionsService, QuestionsRepository],
})
export class QuestionsModule {}
