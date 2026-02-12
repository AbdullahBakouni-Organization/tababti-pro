import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { BullModule } from '@nestjs/bull';
import { ThrottlerModule } from '@nestjs/throttler';

import { DatabaseModule } from '@app/common/database/database.module';

import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { SearchFactory } from './search.factory';

// Strategies
import { DoctorSearchStrategy } from './strategies/doctor-search.strategy';
import { HospitalSearchStrategy } from './strategies/hospital-search.strategy';
import { CenterSearchStrategy } from './strategies/center-search.strategy';
import { AllSearchStrategy } from './strategies/all.strategy';

// AI Services
import { TranslationAiService } from '../translation-ai/translation-ai.service';
import { AiWorkerService } from '../ai-worker/ai-worker.service';

@Module({
  imports: [
    // ⭐ Global cache (needed for TranslationAiService)
    CacheModule.register({
      isGlobal: true,
    }),

    // ⭐ Rate limiting
    ThrottlerModule.forRoot([
      {
        ttl: 60,
        limit: 20,
      },
    ]),

    // ⭐ Async events
    EventEmitterModule.forRoot(),

    // ⭐ Queue
    BullModule.registerQueue({
      name: 'ai',

      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: {
          age: 3600,
          count: 1000,
        },
        removeOnFail: {
          age: 86400,
        },
      },

      settings: {
        stalledInterval: 30000,
        maxStalledCount: 1,
        guardInterval: 5000,
        retryProcessDelay: 5000,
      },
    }),

    DatabaseModule,
  ],

  controllers: [SearchController],

  providers: [
    // Core
    SearchService,
    SearchFactory,

    // Strategies
    DoctorSearchStrategy,
    HospitalSearchStrategy,
    CenterSearchStrategy,
    AllSearchStrategy,

    // AI
    TranslationAiService,
    AiWorkerService,
  ],

  exports: [SearchService],
})
export class SearchModule { }
