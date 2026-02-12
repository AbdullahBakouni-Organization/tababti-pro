import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { BullModule } from '@nestjs/bull';

import { SearchService } from './search.service';
import { SearchController } from './search.controller';
import { SearchFactory } from './search.factory';

import { DoctorSearchStrategy } from './strategies/doctor-search.strategy';
import { HospitalSearchStrategy } from './strategies/hospital-search.strategy';
import { CenterSearchStrategy } from './strategies/center-search.strategy';
import { InsuranceSearchStrategy } from './strategies/insurance.strategy';
import { AllSearchStrategy } from './strategies/all.strategy';

import { TranslationAiService } from '../translation-ai/translation-ai.service';
import { AiWorkerService } from '../ai-worker/ai-worker.service';

@Module({
  imports: [
    EventEmitterModule.forRoot(),
    BullModule.registerQueue({ name: 'ai' }),
    MongooseModule.forFeature([
      { name: 'Doctor', schema: {} },
      { name: 'Hospital', schema: {} },
      { name: 'Center', schema: {} },
      { name: 'InsuranceCompany', schema: {} },
      { name: 'TransliterationCache', schema: {} },
      { name: 'PrivateSpecialization', schema: {} },
    ]),
  ],
  controllers: [SearchController],
  providers: [
    SearchService,
    SearchFactory,
    DoctorSearchStrategy,
    HospitalSearchStrategy,
    CenterSearchStrategy,
    InsuranceSearchStrategy,
    AllSearchStrategy,
    TranslationAiService,
    AiWorkerService,
  ],
  exports: [SearchService],
})
export class SearchModule {}
