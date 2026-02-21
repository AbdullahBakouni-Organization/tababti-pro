// search.service.ts
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

  /**
   * البحث الموحد لجميع الكيانات (أطباء، مستشفيات، مراكز)
   */
  searchAll(dto: SearchFilterDto) {
    return this.orchestrator.searchAll(dto);
  }

  /**
   * مسح الكاش
   */
  clearCache() {
    this.cache.clear();
  }
}
