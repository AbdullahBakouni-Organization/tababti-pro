import { Module, forwardRef } from '@nestjs/common';
import { TranslationAiService } from '../translation-ai/translation-ai.service';
import { AiWorkerService } from '../ai-worker/ai-worker.service';
import { SearchService } from './search.service';
import { SearchVariantsCache } from './cache/search-variants.cache';
import { SearchOrchestratorService } from './orchestrators/search-orchestrator.service';
import { SearchEnhancerService } from './enhancers/search-enhancer.service';
import { SearchQueriesModule } from './queries/search.queries.module';

@Module({
  imports: [forwardRef(() => SearchQueriesModule)], 
  providers: [
    TranslationAiService,
    AiWorkerService,
    SearchService,
    SearchVariantsCache,
    SearchOrchestratorService,
    SearchEnhancerService,
  ],
  exports: [
    TranslationAiService,
    AiWorkerService,
    SearchService,
    SearchVariantsCache,
    SearchOrchestratorService,
    SearchEnhancerService,
  ],
})
export class SearchCoreModule {}
