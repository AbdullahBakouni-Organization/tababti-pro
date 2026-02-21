import { Injectable } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { SearchVariantsCache } from '../cache/search-variants.cache';
import { TranslationAiService } from '../../translation-ai/translation-ai.service'
@Injectable()
export class SearchEnhancerService {
  constructor(
    private readonly ai: TranslationAiService,
    private readonly cache: SearchVariantsCache,
    private readonly events: EventEmitter2,
  ) {}

  trigger(term: string) {
    if (!this.cache.has(term)) {
      this.events.emit('search.enhance', term);
    }
  }

  @OnEvent('search.enhance', { async: true })
  async enhance(term: string) {
    if (/[\u0600-\u06FF]/.test(term)) return;

    try {
      const variants = await this.ai.transliterate(term, 'en', 'ar');
      this.cache.set(term, variants);
    } catch {
      this.cache.set(term, [], 5 * 60 * 1000);
    }
  }
}
