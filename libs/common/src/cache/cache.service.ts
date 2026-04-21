// // libs/common/cache/cache.service.ts
// import { Injectable } from '@nestjs/common';
// import { RedisService } from '../redis/redis.service';
// import { LRUCache } from 'lru-cache';

// @Injectable()
// export class CacheService {
//   private memoryCache: LRUCache<string, any>;
//   private INVALIDATION_CHANNEL = 'cache:invalidate';
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
//   async onModuleInit() {
//     // Subscribe to invalidation events
//     console.log('CacheService subscription started');
//     await this.redisService.subscribe(this.INVALIDATION_CHANNEL, (key) => {
//       this.memoryCache.delete(key);
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
//     await this.redisService.publish(this.INVALIDATION_CHANNEL, pattern);
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
//     await this.redisService.publish(this.INVALIDATION_CHANNEL, key);
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
  private readonly INVALIDATION_CHANNEL = 'cache:invalidate';

  constructor(private readonly redisService: RedisService) {
    this.memoryCache = new LRUCache({
      max: 1000,
      ttl: 60 * 1000,
      allowStale: false,
      updateAgeOnGet: false,
      updateAgeOnHas: false,
    });
  }

  async onModuleInit() {
    this.logger.log('CacheService: subscribing to invalidation channel');

    // The RedisService MUST use a DEDICATED subscriber connection here.
    // Never share a connection used for GET/SET/DEL with pub/sub.
    await this.redisService.subscribe(
      this.INVALIDATION_CHANNEL,
      (message: string) => {
        try {
          // Message format: "exact:<key>" or "pattern:<pattern>"
          if (message.startsWith('exact:')) {
            const key = message.slice('exact:'.length);
            this.memoryCache.delete(key);
            this.logger.debug(`LRU invalidated exact key: ${key}`);
          } else if (message.startsWith('pattern:')) {
            const pattern = message.slice('pattern:'.length);
            this._deleteByPattern(pattern);
            this.logger.debug(`LRU invalidated pattern: ${pattern}`);
          }
        } catch (err) {
          this.logger.error('Invalidation handler error', err);
        }
      },
    );
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  async get<T>(key: string): Promise<T | null> {
    // Layer 1: Memory cache
    const memoryValue = this.memoryCache.get(key);
    if (memoryValue !== undefined) {
      return memoryValue as T;
    }

    // Layer 2: Redis cache
    const redisValue = await this.redisService.get(key);
    if (redisValue) {
      // ✅ always parse — it was stored as JSON.stringify()
      const parsed =
        typeof redisValue === 'string' ? JSON.parse(redisValue) : redisValue;
      // Repopulate memory cache with the parsed object
      this.memoryCache.set(key, parsed);
      return parsed as T;
    }

    return null;
  }
  async set(
    key: string,
    value: any,
    memoryTTL: number = 60,
    redisTTL: number = 3600,
  ): Promise<void> {
    this.memoryCache.set(key, value, { ttl: memoryTTL * 1000 });
    await this.redisService.set(key, JSON.stringify(value), redisTTL);
  }

  /**
   * Invalidate a single exact key across all layers + notify other instances.
   */
  async invalidate(key: string): Promise<void> {
    this.memoryCache.delete(key);
    await this.redisService.del(key);
    // 🔴 was missing — other instances never knew about this invalidation
    await this.redisService.publish(this.INVALIDATION_CHANNEL, `exact:${key}`);
  }

  /**
   * Invalidate all keys matching a glob pattern across all layers + notify.
   */
  async invalidatePattern(pattern: string): Promise<void> {
    // Local memory
    this._deleteByPattern(pattern);

    // Redis
    await this.redisService.deletePattern(pattern);

    // 🔴 was publishing raw pattern — subscribers couldn't distinguish
    //    "is this an exact key or a pattern?"
    await this.redisService.publish(
      this.INVALIDATION_CHANNEL,
      `pattern:${pattern}`,
    );
  }

  /**
   * Alias kept for backward compat — prefer invalidate().
   */
  async del(key: string): Promise<void> {
    return this.invalidate(key);
  }

  /**
   * Redis SET NX EX — atomic distributed lock. Returns `true` only when the
   * caller acquires the lock (key did not exist); `false` when another holder
   * is still inside the TTL window. The lock is intentionally NOT released on
   * success: callers rely on the TTL to debounce duplicate events arriving
   * within the window (e.g. browser retries republishing the same Kafka
   * message). Redis failures return `false` so callers treat the job as
   * already running rather than duplicating work under an outage.
   */
  async acquireLock(key: string, ttlSeconds: number): Promise<boolean> {
    try {
      const client = this.redisService.getClient();
      const result = await client.set(key, '1', 'EX', ttlSeconds, 'NX');
      return result === 'OK';
    } catch (err) {
      this.logger.error(`acquireLock(${key}) failed`, err as Error);
      return false;
    }
  }

  // ─── Private ───────────────────────────────────────────────────────────────

  private _deleteByPattern(pattern: string): void {
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    for (const key of this.memoryCache.keys()) {
      if (regex.test(key)) {
        this.memoryCache.delete(key);
      }
    }
  }
}
