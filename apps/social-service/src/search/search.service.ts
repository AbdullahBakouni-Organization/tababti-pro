import { Injectable } from '@nestjs/common';
import { SearchFilterDto } from './dto/search-filter.dto';
import { SearchOrchestratorService } from './orchestrators/search-orchestrator.service';
import { SearchVariantsCache } from './cache/search-variants.cache';

@Injectable()
export class SearchService {
  constructor(
    private readonly orchestrator: SearchOrchestratorService,
    private readonly cache: SearchVariantsCache,
  ) {}

  async searchAll(dto: SearchFilterDto) {
    return this.orchestrator.searchAll(dto);
  }

  clearCache() {
    this.cache.clear();
    console.log('✅ Search cache cleared');
  }
}
