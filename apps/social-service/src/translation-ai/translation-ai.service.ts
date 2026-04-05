import 'dotenv/config';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { Cache } from 'cache-manager';
import pLimit from 'p-limit';
import { LRUCache } from 'lru-cache';
import { toError } from '@app/common/helpers/error.helper';
import {
  FlaskHealthResponse,
  FlaskSingleResponse,
  FlaskStatsResponse,
} from '@app/common/interfaces/translation-_ai.interface';
import { ArabicVariantsUtils } from '@app/common/utils/arabic-variants.util';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

/**
 * Translation AI Service - OPTIMIZED VERSION
 *
 * Strategy:
 * - Arabic input → Use local Arabic variants utility (INSTANT, no Flask call)
 * - English input → Use Flask API for EN→AR translation
 */
@Injectable()
export class TranslationAiService implements OnModuleInit {
  private readonly logger = new Logger(TranslationAiService.name);
  private flaskBaseUrl: string;
  private memoryCache: LRUCache<string, string[]>;

  // Connection pooling
  private readonly maxConcurrentRequests = 20;
  private limiter = pLimit(this.maxConcurrentRequests);

  // Request deduplication
  private pendingRequests = new Map<string, Promise<string[]>>();

  // Performance metrics
  private metrics = {
    cacheHits: 0,
    cacheMisses: 0,
    flaskRequests: 0,
    arabicVariantRequests: 0,
    errors: 0,
    avgResponseTime: 0,
  };

  constructor(
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    @InjectModel('TransliterationCache')
    private readonly TransliterationCacheModel: Model<any>,
  ) {
    this.flaskBaseUrl = process.env.FLASK_API_URL || 'http://localhost:5000';
  }

  async onModuleInit(): Promise<void> {
    this.memoryCache = new LRUCache({
      max: 5000,
      ttl: 1000 * 60 * 60 * 24 * 7, // 7 days
    });

    try {
      const response = await fetch(`${this.flaskBaseUrl}/health`);
      const data = (await response.json()) as {
        status: string;
        model_loaded?: boolean;
        device?: string;
        note?: string;
      };

      await this.loadCacheFromDatabase();

      if (data.status === 'healthy') {
        this.logger.log('Flask API connected (EN→AR only)');
        this.logger.log(
          `Model loaded: ${data.model_loaded}, device: ${data.device}`,
        );
        this.logger.log(data.note ?? 'Arabic variants handled locally');
      }
    } catch (err) {
      const error = toError(err);
      this.logger.error(`Flask API not available: ${error.message}`);
      this.logger.warn(
        'English→Arabic translation will fail; Arabic variants will still work',
      );
    }
  }

  private async loadCacheFromDatabase() {
    try {
      const cached = await this.TransliterationCacheModel.find({})
        .sort({ hitCount: -1 })
        .limit(1000)
        .lean();

      cached.forEach((item) => {
        const key = this.getCacheKey(item.text);
        this.memoryCache.set(key, item.variants);
      });

      this.logger.log(`Loaded ${cached.length} cached translations from DB`);
    } catch (error) {
      this.logger.error('Failed to load cache from DB', error);
    }
  }

  private getCacheKey(text: string): string {
    return `${text.toLowerCase().trim()}`;
  }

  /**
   * MAIN METHOD: Transliterate text
   * - Arabic → Generate variants locally (FAST)
   * - English → Call Flask API (SLOW but necessary)
   */
  async transliterate(
    text: string,
    from: 'en' | 'ar',
    to: 'ar' | 'en',
  ): Promise<string[]> {
    if (!text || text.length < 2) return [];

    const cacheKey = this.getCacheKey(text);

    // Tier 1: Memory Cache (1-5ms) ⚡
    const memCached = this.memoryCache.get(cacheKey);
    if (memCached) {
      this.metrics.cacheHits++;
      return memCached;
    }

    // Tier 2: Database Cache (10-50ms) 🔥
    const dbCached = await this.getFromDatabaseCache(text);
    if (dbCached) {
      this.memoryCache.set(cacheKey, dbCached);
      this.metrics.cacheHits++;
      return dbCached;
    }

    this.metrics.cacheMisses++;

    // Tier 3: Generate variants
    let variants: string[] = [];

    if (from === 'ar') {
      // ARABIC INPUT → Use local utility (INSTANT!)
      this.logger.debug(`Generating Arabic variants for: "${text}"`);
      this.metrics.arabicVariantRequests++;

      variants = ArabicVariantsUtils.getArabicVariants(text);

      this.logger.debug(`Generated ${variants.length} Arabic variants locally`);
    } else if (from === 'en' && to === 'ar') {
      // ENGLISH INPUT → Call Flask API
      this.logger.debug(`Calling Flask API for: "${text}"`);

      // Check for pending request (deduplication)
      if (this.pendingRequests.has(cacheKey)) {
        return this.pendingRequests.get(cacheKey)!;
      }

      const request = this.limiter(() =>
        this.flaskTransliterate(text, from, to),
      );
      this.pendingRequests.set(cacheKey, request);

      try {
        variants = await request;
      } finally {
        this.pendingRequests.delete(cacheKey);
      }
    } else {
      this.logger.warn(`Unsupported transliteration direction: ${from}→${to}`);
      return [text, text.toLowerCase()];
    }

    // Cache results
    this.memoryCache.set(cacheKey, variants);
    await this.saveToDatabaseCache(text, variants);

    return variants;
  }

  /**
   * Batch transliteration
   */
  async transliterateBatch(
    texts: string[],
    from: 'en' | 'ar',
    to: 'ar' | 'en',
  ): Promise<Map<string, string[]>> {
    const results = new Map<string, string[]>();
    const uncachedTexts: string[] = [];

    for (const text of texts) {
      const cacheKey = this.getCacheKey(text);
      const cached = this.memoryCache.get(cacheKey);

      if (cached) {
        results.set(text, cached);
      } else {
        uncachedTexts.push(text);
      }
    }

    this.logger.debug(
      `Batch: ${results.size}/${texts.length} cached, ${uncachedTexts.length} need processing`,
    );

    if (uncachedTexts.length > 0) {
      // Process in batches of 5
      const batchSize = 5;
      for (let i = 0; i < uncachedTexts.length; i += batchSize) {
        const batch = uncachedTexts.slice(i, i + batchSize);

        const batchResults = await Promise.all(
          batch.map((text) => this.transliterate(text, from, to)),
        );

        batch.forEach((text, index) => {
          results.set(text, batchResults[index]);
        });

        // Small delay between batches
        if (i + batchSize < uncachedTexts.length) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }
    }

    return results;
  }

  /**
   * Get from database cache
   */
  private async getFromDatabaseCache(text: string): Promise<string[] | null> {
    try {
      const normalized = text.toLowerCase().trim();

      // do not search DB for Arabic strings
      if (/[\u0600-\u06FF]/.test(normalized)) return null;

      const cached = await this.TransliterationCacheModel.findOne({
        text: normalized,
      }).lean();

      if (!cached) return null;

      // increment hit counter asynchronously
      this.TransliterationCacheModel.updateOne(
        { text: normalized },
        { $inc: { hitCount: 1 } },
      ).catch(() => {});

      return cached.variants.slice(0, 7);
    } catch (error) {
      this.logger.error('Mongo cache lookup error', error);
      return null;
    }
  }

  /**
   * Save to database cache
   */
  private async saveToDatabaseCache(
    text: string,
    variants: string[],
  ): Promise<void> {
    try {
      await this.TransliterationCacheModel.updateOne(
        { text: text.toLowerCase().trim() },
        {
          $set: {
            variants,
            updatedAt: new Date(),
          },
          $setOnInsert: {
            hitCount: 1,
            createdAt: new Date(),
          },
        },
        { upsert: true },
      );
    } catch (error) {
      this.logger.error('Failed to save transliteration to cache', error);
    }
  }

  /**
   * Call Flask API for EN→AR translation
   */
  private async flaskTransliterate(
    text: string,
    from: 'en' | 'ar',
    to: 'ar' | 'en',
    retries = 3,
  ): Promise<string[]> {
    const startTime = Date.now();

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000); // 30 seconds

        this.metrics.flaskRequests++;

        const response = await fetch(`${this.flaskBaseUrl}/transliterate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, from, to }),
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (!response.ok) {
          throw new Error(`Flask request failed: ${response.status}`);
        }

        const data = (await response.json()) as FlaskSingleResponse;
        const duration = Date.now() - startTime;

        // Check if Flask returned empty (Arabic input detected)
        if (data.is_arabic) {
          this.logger.debug(
            `Flask detected Arabic input: "${text}" - using local variants`,
          );
          return ArabicVariantsUtils.getArabicVariants(text);
        }

        this.logger.debug(
          `Flask API success: "${text}" in ${duration}ms (attempt ${attempt})`,
        );

        this.updateAvgResponseTime(duration);

        return data.variants ?? [];
      } catch (error) {
        const duration = Date.now() - startTime;

        if (attempt === retries) {
          this.metrics.errors++;
          this.logger.error(
            `Flask API failed after ${retries} attempts: "${text}" (${duration}ms)`,
            error,
          );

          // Fallback
          return [text, text.toLowerCase()];
        }

        this.logger.warn(`Flask attempt ${attempt} failed, retrying...`);
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
      }
    }

    return [text];
  }

  /**
   * Update average response time metric
   */
  private updateAvgResponseTime(responseTime: number) {
    const totalRequests = this.metrics.flaskRequests;
    this.metrics.avgResponseTime =
      (this.metrics.avgResponseTime * (totalRequests - 1) + responseTime) /
      totalRequests;
  }

  /**
   * Get Flask API statistics
   */
  async getFlaskStats(): Promise<FlaskStatsResponse | null> {
    try {
      const response = await fetch(`${this.flaskBaseUrl}/stats`);
      return (await response.json()) as FlaskStatsResponse;
    } catch {
      return null;
    }
  }

  /**
   * Get comprehensive statistics
   */
  async getStats() {
    const hitRate =
      this.metrics.cacheHits /
      (this.metrics.cacheHits + this.metrics.cacheMisses || 1);

    const flaskStats = await this.getFlaskStats();

    return {
      nestjs: {
        cache: {
          hitRate: hitRate,
          hits: this.metrics.cacheHits,
          misses: this.metrics.cacheMisses,
        },
        processing: {
          flaskRequests: this.metrics.flaskRequests,
          arabicVariantRequests: this.metrics.arabicVariantRequests,
          errors: this.metrics.errors,
          avgResponseTime: this.metrics.avgResponseTime,
        },
        performance: {
          concurrentLimit: this.maxConcurrentRequests,
          pendingRequests: this.pendingRequests.size,
        },
      },
      flask: flaskStats,
    };
  }

  /**
   * Clear all caches
   */
  async clearAllCaches() {
    this.memoryCache.clear();
    await this.cacheManager.set('cache', {});

    try {
      await fetch(`${this.flaskBaseUrl}/cache/clear`, {
        method: 'POST',
      });
      this.logger.log('All caches cleared (NestJS + Flask)');
    } catch (error) {
      this.logger.error('Failed to clear Flask cache', error);
    }
  }

  /**
   * Check Flask API health
   */
  async checkHealth(): Promise<boolean> {
    try {
      const response = await fetch(`${this.flaskBaseUrl}/health`);
      const data = (await response.json()) as FlaskHealthResponse;

      return data.status === 'healthy';
    } catch {
      return false;
    }
  }
}
