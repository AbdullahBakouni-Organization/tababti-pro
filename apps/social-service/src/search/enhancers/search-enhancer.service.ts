import { Injectable, OnModuleInit } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { SearchVariantsCache } from '../cache/search-variants.cache';
import { TranslationAiService } from '../../translation-ai/translation-ai.service';

interface SearchMetrics {
  cacheHits: number;
  cacheMisses: number;
  aiCalls: number;
  aiFailures: number;
  warmupTriggers: number;
}

@Injectable()
export class SearchEnhancerService implements OnModuleInit {
  private readonly metrics: SearchMetrics = {
    cacheHits: 0,
    cacheMisses: 0,
    aiCalls: 0,
    aiFailures: 0,
    warmupTriggers: 0,
  };

  constructor(
    private readonly ai: TranslationAiService,
    private readonly cache: SearchVariantsCache,
    private readonly events: EventEmitter2,
  ) {}

  async onModuleInit() {
    this.startWarmup();
    this.startMetricsReporting();
  }

  trigger(term: string) {
    this.triggerBackgroundEnhancement(term);
  }

  private triggerBackgroundEnhancement(term: string) {
    if (this.cache.has(term)) {
      this.metrics.cacheHits++;
      return;
    }

    this.metrics.cacheMisses++;
    this.metrics.warmupTriggers++;
    this.events.emit('search.enhance', term);
  }

  // ===== Background warmup =====
  private async startWarmup() {
    setTimeout(async () => {
      const commonTerms = await this.getCommonSearchTerms();
      for (const term of commonTerms) {
        this.triggerBackgroundEnhancement(term);
      }
      console.log(`🔥 Warmup triggered for ${commonTerms.length} terms`);
    }, 3000);
  }

  private async getCommonSearchTerms(): Promise<string[]> {
    return [
      'قلب',
      'عيون',
      'اسنان',
      'اطفال',
      'جلدية',
      'عظام',
      'cardiology',
      'dentist',
      'pediatric',
      'dermatology',
      'orthopedic',
    ];
  }

  @OnEvent('search.enhance', { async: true })
  async enhance(term: string) {
    if (/[\u0600-\u06FF]/.test(term)) return;

    this.metrics.aiCalls++;

    try {
      const variants = await this.ai.transliterate(term, 'en', 'ar');
      this.cache.set(term, variants);
    } catch {
      this.metrics.aiFailures++;
      this.cache.set(term, [], 5 * 60 * 1000);
    }
  }

  private startMetricsReporting() {
    setInterval(() => {
      console.log('📊 Search Metrics', {
        ...this.metrics,
        cacheSize: this.cache.size(),
      });
    }, 60_000);
  }
}
