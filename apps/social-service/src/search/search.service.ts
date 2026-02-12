import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import DataLoader from 'dataloader';
import { LRUCache } from 'lru-cache';
import { SearchFilterDto } from './dto/search-filter.dto';
import { TranslationAiService } from '../translation-ai/translation-ai.service';
import { ConditionEnum } from '@app/common/database/schemas/common.enums';
import { SearchFactory } from './search.factory';

interface SearchEnhancementEvent {
  searchTerm: string;
  timestamp: number;
}

@Injectable()
export class SearchService implements OnModuleInit, OnModuleDestroy {
  private searchVariantsCache: LRUCache<string, string[]>;
  private metrics = {
    fastPathHits: 0,
    slowPathHits: 0,
    cacheHits: 0,
    aiEnhancements: 0,
  };
  private doctorLoader: DataLoader<string, any>;
  private hospitalLoader: DataLoader<string, any>;
  private centerLoader: DataLoader<string, any>;

  constructor(
    private readonly factory: SearchFactory,
    private readonly aiService: TranslationAiService,
    private readonly eventEmitter: EventEmitter2,
    @InjectModel('TransliterationCache')
    private readonly transliterationCacheModel: Model<any>,
    @InjectModel('Doctor') private readonly doctorModel: Model<any>,
    @InjectModel('Hospital') private readonly hospitalModel: Model<any>,
    @InjectModel('Center') private readonly centerModel: Model<any>,
  ) {}

  async onModuleInit() {
    this.searchVariantsCache = new LRUCache({
      max: 5000,
      ttl: 1000 * 60 * 60 * 24,
      updateAgeOnGet: true,
    });
    await this.hydrateCacheFromDb();
    this.initDataLoaders();
    this.startBackgroundWarmup();
    this.startMetricsReporting();
  }

  onModuleDestroy() {
    console.log('📊 Final Search Metrics:', this.metrics);
  }

  private async hydrateCacheFromDb() {
    try {
      const cacheDocs = await this.transliterationCacheModel
        .find()
        .sort({ hitCount: -1 })
        .limit(500)
        .select('text variants')
        .lean()
        .exec();
      for (const d of cacheDocs)
        this.searchVariantsCache.set(
          d.text.toLowerCase().trim(),
          Array.from(new Set([d.text, ...(d.variants ?? [])])),
        );
    } catch (e) {
      /* ignore */
    }
  }

  private initDataLoaders() {
    this.doctorLoader = new DataLoader(async (ids: readonly string[]) => {
      const docs = await this.doctorModel
        .find({ _id: { $in: [...ids] } })
        .select('firstName middleName lastName rating')
        .lean()
        .exec();
      const map = new Map(docs.map((d) => [d._id.toString(), d]));
      return ids.map((id) => map.get(id.toString()) ?? null);
    });

    this.hospitalLoader = new DataLoader(async (ids: readonly string[]) => {
      const docs = await this.hospitalModel
        .find({ _id: { $in: [...ids] } })
        .select('name city rating')
        .lean()
        .exec();
      const map = new Map(docs.map((d) => [d._id.toString(), d]));
      return ids.map((id) => map.get(id.toString()) ?? null);
    });

    this.centerLoader = new DataLoader(async (ids: readonly string[]) => {
      const docs = await this.centerModel
        .find({ _id: { $in: [...ids] } })
        .select('name city rating')
        .lean()
        .exec();
      const map = new Map(docs.map((d) => [d._id.toString(), d]));
      return ids.map((id) => map.get(id.toString()) ?? null);
    });
  }

  async filterEntitiesOptimized(query: SearchFilterDto) {
    const start = Date.now();
    const condition = query.condition ?? ConditionEnum.ALL;

    // prepare pagination safely
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    // get variants non-blocking and attach to query -> strategies will use it
    const variants = query.search
      ? this.getSearchVariantsNonBlocking(query.search)
      : [];

    const strategy = this.factory.getStrategy(condition);

    const result = await strategy.search(
      { ...query, variants },
      skip,
      limit,
      query.sortBy,
      query.order ?? 'desc',
    );

    const dur = Date.now() - start;
    console.log(
      `⚡ Search (${condition}) completed in ${dur}ms (q="${query.search ?? ''}")`,
    );
    return result;
  }

  private triggerBackgroundEnhancement(searchTerm: string) {
    const key = searchTerm.toLowerCase().trim();
    if (this.searchVariantsCache.has(key)) {
      this.metrics.cacheHits++;
      return;
    }
    this.eventEmitter.emit('search.enhance', {
      searchTerm,
      timestamp: Date.now(),
    });
  }

  @OnEvent('search.enhance', { async: true })
  async handleSearchEnhancement(event: SearchEnhancementEvent) {
    const term = event.searchTerm.trim();
    const key = term.toLowerCase();
    if (/[\u0600-\u06FF]/.test(term)) return; // skip Arabic translit generation
    try {
      const aiVariants = await this.aiService.transliterate(term, 'en', 'ar');
      const finalVariants = Array.from(
        new Set([
          term,
          term.toLowerCase(),
          ...aiVariants,
          ...this.basicVariants(term),
        ]),
      )
        .filter(Boolean)
        .slice(0, 7);
      this.searchVariantsCache.set(key, finalVariants);
      this.metrics.aiEnhancements++;
    } catch {
      this.searchVariantsCache.set(key, this.basicVariants(term).slice(0, 5), {
        ttl: 5 * 60 * 1000,
      });
    }
  }

  private getSearchVariantsNonBlocking(searchTerm: string): string[] {
    const key = searchTerm.toLowerCase().trim();
    const cached = this.searchVariantsCache.get(key);
    if (cached) {
      this.metrics.fastPathHits++;
      return cached;
    }
    this.metrics.slowPathHits++;
    const basic = this.basicVariants(searchTerm).slice(0, 5);
    this.searchVariantsCache.set(key, basic, { ttl: 2 * 60 * 1000 });
    return basic;
  }

  private basicVariants(text: string): string[] {
    // small deterministic set
    const set = new Set<string>();
    const clean = text.trim();
    set.add(clean);
    set.add(clean.toLowerCase());
    return Array.from(set).slice(0, 7);
  }

  // DataLoader helpers
  async getDoctorById(id: string) {
    return this.doctorLoader.load(id);
  }
  async getHospitalById(id: string) {
    return this.hospitalLoader.load(id);
  }
  async getCenterById(id: string) {
    return this.centerLoader.load(id);
  }

  clearCache() {
    this.searchVariantsCache.clear();
    this.doctorLoader.clearAll();
    this.hospitalLoader.clearAll();
    this.centerLoader.clearAll();
    console.log('✅ search caches cleared');
  }

  private startBackgroundWarmup() {
    setTimeout(async () => {
      try {
        const common = await this.getCommonSearchTerms();
        for (const t of common) {
          this.eventEmitter.emit('search.enhance', {
            searchTerm: t,
            timestamp: Date.now(),
          });
        }
      } catch (e) {
        /* ignore */
      }
    }, 5000);
  }

  private async getCommonSearchTerms(): Promise<string[]> {
    try {
      const cached = await this.transliterationCacheModel
        .find()
        .sort({ hitCount: -1 })
        .limit(100)
        .select('text')
        .lean()
        .exec();
      return cached.map((c: any) => c.text);
    } catch {
      return ['cardiology', 'dentist', 'قلب', 'عيون', 'اسنان'];
    }
  }

  private startMetricsReporting() {
    setInterval(() => {
      const cacheSize = this.searchVariantsCache.size;
      const hitRate =
        this.metrics.fastPathHits /
        (this.metrics.fastPathHits + this.metrics.slowPathHits || 1);
      console.log('📊 Search Metrics:', {
        cacheSize,
        cacheHitRate: `${(hitRate * 100).toFixed(2)}%`,
        ...this.metrics,
      });
    }, 60_000);
  }
}
