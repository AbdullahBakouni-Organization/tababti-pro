// libs/common/cache/cache.service.ts
import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { LRUCache } from 'lru-cache';

@Injectable()
export class CacheService {
  // Fix 1: Explicitly type the cache to hold 'any' values
  private memoryCache: LRUCache<string, any>;

  constructor(private readonly redisService: RedisService) {
    this.memoryCache = new LRUCache({
      max: 1000,
      ttl: 60 * 1000,
      allowStale: false,
      updateAgeOnGet: false,
      updateAgeOnHas: false,
    });
  }

  async get<T>(key: string): Promise<T | null> {
    // Layer 1: Check memory cache
    // Fix 2: Remove <T> from .get() (it's not generic) and cast the result
    const memoryValue = this.memoryCache.get(key) as T | undefined;

    if (memoryValue !== undefined) {
      return memoryValue;
    }

    // Layer 2: Check Redis
    const redisValue = await this.redisService.get(key);
    if (redisValue) {
      this.memoryCache.set(key, redisValue);

      return redisValue as T;
    }

    return null;
  }

  async set(
    key: string,
    value: any,
    memoryTTL: number = 60 * 1000, // Ensure unit is consistent (ms)
    redisTTL: number = 3600,
  ): Promise<void> {
    // Layer 1: Memory cache
    // Fix 4: 'lru-cache' v7+ expects an options object for TTL, not a raw number
    this.memoryCache.set(key, value, { ttl: memoryTTL });

    // Layer 2: Redis cache
    await this.redisService.set(key, JSON.stringify(value), redisTTL);
  }

  async invalidate(key: string): Promise<void> {
    this.memoryCache.delete(key); // Fix 5: method is .delete(), not .del() in newer versions
    await this.redisService.del(key);
  }

  async invalidatePattern(pattern: string): Promise<void> {
    // Fix 6: .keys() returns an Iterator, not an Array. We must convert it.
    // Also, iterating over all keys in memory can be expensive; use cautiously.
    const keys = [...this.memoryCache.keys()];

    for (const key of keys) {
      if (this.matchPattern(key, pattern)) {
        this.memoryCache.delete(key);
      }
    }

    await this.redisService.deletePattern(pattern);
  }

  private matchPattern(key: string, pattern: string): boolean {
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    return regex.test(key);
  }
}
