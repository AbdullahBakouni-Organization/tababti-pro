import { Module } from '@nestjs/common';
import { AiWorkerService } from './ai-worker.service';
import { BullModule } from '@nestjs/bull';
import { TranslationAiService } from '../translation-ai/translation-ai.service';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'ai',
    }),
  ],
  providers: [AiWorkerService, TranslationAiService],
  exports: [AiWorkerService],
})
export class AiWorkerModule {}
