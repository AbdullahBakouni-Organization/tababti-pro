import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { QuestionsController } from './controller/questions.controller';
import { QuestionsService } from './service/questions.service';
import { QuestionsRepository } from './repository/questions.repository';

import {
  Question,
  QuestionSchema,
} from '@app/common/database/schemas/question.schema';
import {
  Answer,
  AnswerSchema,
} from '@app/common/database/schemas/answer.schema';
import { User, UserSchema } from '@app/common/database/schemas/user.schema';
import {
  Doctor,
  DoctorSchema,
} from '@app/common/database/schemas/doctor.schema';
import {
  Hospital,
  HospitalSchema,
} from '@app/common/database/schemas/hospital.schema';
import {
  Center,
  CenterSchema,
} from '@app/common/database/schemas/center.schema';

import { SpecializationsModule } from '../specializations/specializations.module';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        ttl: 60,
        limit: 5,
      },
    ]),
    MongooseModule.forFeature([
      { name: Question.name, schema: QuestionSchema },
      { name: Answer.name, schema: AnswerSchema },
      { name: User.name, schema: UserSchema },
      { name: Doctor.name, schema: DoctorSchema },
      { name: Hospital.name, schema: HospitalSchema },
      { name: Center.name, schema: CenterSchema },
    ]),
    SpecializationsModule,
  ],
  controllers: [QuestionsController],
  providers: [
    QuestionsService,
    QuestionsRepository,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class QuestionsModule {}
