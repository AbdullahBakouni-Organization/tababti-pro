// // libs/common/cache/cache.service.ts
// import { Injectable } from '@nestjs/common';
// import { RedisService } from '../redis/redis.service';
// import { LRUCache } from 'lru-cache';

// @Injectable()
// export class CacheService {
//   private memoryCache: LRUCache<string, any>;

//   constructor(private readonly redisService: RedisService) {
//     // Layer 1: Memory cache
//     this.memoryCache = new LRUCache({
//       max: 1000, // max items in memory
//       ttl: 60 * 1000, // 1 minute (milliseconds)
//       allowStale: false,
//       updateAgeOnGet: false,
//       updateAgeOnHas: false,
//     });
//   }

//   /**
//    * Get from cache (checks all layers)
//    */
//   async get<T>(key: string): Promise<T | null> {
//     // Layer 1: Memory cache
//     const memoryValue = this.memoryCache.get(key);
//     if (memoryValue !== undefined) {
//       return memoryValue as T;
//     }

//     // Layer 2: Redis cache
//     const redisValue = await this.redisService.get(key);
//     if (redisValue) {
//       const parsed = redisValue as T;

//       // Repopulate memory cache (use default TTL)
//       this.memoryCache.set(key, parsed);

//       return parsed;
//     }

//     // Layer 3: Cache miss
//     return null;
//   }

//   /**
//    * Set in all cache layers
//    */
//   async set(
//     key: string,
//     value: any,
//     memoryTTL: number = 60,
//     redisTTL: number = 3600,
//   ): Promise<void> {
//     // Layer 1: Memory cache
//     this.memoryCache.set(key, value, {
//       ttl: memoryTTL * 1000,
//     });

//     // Layer 2: Redis cache
//     await this.redisService.set(key, JSON.stringify(value), redisTTL);
//   }

//   /**
//    * Invalidate specific key from all layers
//    */
//   async invalidate(key: string): Promise<void> {
//     this.memoryCache.delete(key);
//     await this.redisService.del(key);
//   }

//   /**
//    * Invalidate by pattern (only Redis and Memory)
//    */
//   async invalidatePattern(pattern: string): Promise<void> {
//     // Layer 1: Memory cache
//     for (const key of this.memoryCache.keys()) {
//       if (this.matchPattern(key, pattern)) {
//         this.memoryCache.delete(key);
//       }
//     }

//     // Layer 2: Redis cache
//     await this.redisService.deletePattern(pattern);
//   }

//   private matchPattern(key: string, pattern: string): boolean {
//     const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
//     return regex.test(key);
//   }

//   async del(key: string): Promise<void> {
//     // Layer 1: Memory cache
//     this.memoryCache.delete(key);

//     // Layer 2: Redis cache
//     await this.redisService.del(key);
//   }
// }

// libs/common/cache/cache.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { LRUCache } from 'lru-cache';

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);
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
    // Layer 1: Memory cache (already a parsed object)
    const memoryValue = this.memoryCache.get(key);
    if (memoryValue !== undefined) {
      this.logger.debug(`[Cache HIT] memory: ${key}`);
      return memoryValue as T;
    }

    // Layer 2: Redis cache
    // ✅ RedisService.get() already calls JSON.parse() — returns T | null directly
    const redisValue = await this.redisService.get<T>(key);
    if (redisValue !== null && redisValue !== undefined) {
      this.memoryCache.set(key, redisValue);
      this.logger.debug(`[Cache HIT] redis: ${key}`);
      return redisValue;
    }

    this.logger.debug(`[Cache MISS]: ${key}`);
    return null;
  }

  async set(
    key: string,
    value: any,
    memoryTTL: number = 60,
    redisTTL: number = 3600,
  ): Promise<void> {
    // Layer 1: Memory cache (store raw object)
    this.memoryCache.set(key, value, { ttl: memoryTTL * 1000 });

    // ✅ Pass value directly — RedisService.set() handles JSON.stringify internally
    await this.redisService.set(key, value, redisTTL);

    this.logger.debug(
      `[Cache SET]: ${key} (memory: ${memoryTTL}s, redis: ${redisTTL}s)`,
    );
  }

  async del(key: string): Promise<void> {
    this.memoryCache.delete(key);
    await this.redisService.del(key);
    this.logger.debug(`[Cache DEL]: ${key}`);
  }

  async invalidate(key: string): Promise<void> {
    this.memoryCache.delete(key);
    await this.redisService.del(key);
    this.logger.debug(`[Cache INVALIDATE]: ${key}`);
  }

  async invalidatePattern(pattern: string): Promise<void> {
    for (const key of this.memoryCache.keys()) {
      if (this.matchPattern(key, pattern)) {
        this.memoryCache.delete(key);
      }
    }
    await this.redisService.deletePattern(pattern);
    this.logger.debug(`[Cache INVALIDATE PATTERN]: ${pattern}`);
  }

  async has(key: string): Promise<boolean> {
    if (this.memoryCache.has(key)) return true;
    const redisValue = await this.redisService.get(key);
    return redisValue !== null && redisValue !== undefined;
  }

  private matchPattern(key: string, pattern: string): boolean {
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    return regex.test(key);
  }
}
