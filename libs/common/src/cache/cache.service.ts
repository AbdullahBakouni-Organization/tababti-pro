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
import { randomUUID } from 'crypto';
import { RedisService } from '../redis/redis.service';
import { LRUCache } from 'lru-cache';

// Compare-and-delete: only release the lock if the stored value still matches
// the token we issued at acquire time. Prevents Job A (TTL-expired) from
// deleting Job B's freshly-acquired lock and triggering cascading lock loss.
const RELEASE_LOCK_LUA = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`;

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
   * Redis SET NX EX — atomic distributed lock with a fencing token.
   *
   * Return contract (three-state):
   *   - `string` (UUID token) → lock acquired; pass this token to
   *     `releaseLock(key, token)` so the release is compare-and-delete and
   *     cannot stomp another holder's lock if our TTL expired first.
   *   - `false` → another holder owns the lock; caller should skip cleanly.
   *   - `null` → Redis is unreachable; caller should throw and let Bull
   *     retry. Treating Redis outages as "lock held" silently swallows
   *     legitimate doctor edits — fail loudly instead.
   */
  async acquireLock(
    key: string,
    ttlSeconds: number,
  ): Promise<string | false | null> {
    try {
      const client = this.redisService.getClient();
      const token = randomUUID();
      const result = await client.set(key, token, 'EX', ttlSeconds, 'NX');
      return result === 'OK' ? token : false;
    } catch (err) {
      this.logger.error(`acquireLock(${key}) failed`, err as Error);
      return null;
    }
  }

  /**
   * Compare-and-delete release. Only deletes the key when the stored value
   * equals the token issued at acquire time. Safe against the classic
   * "expired holder deletes new holder's lock" cascade.
   *
   * Errors during release are logged but never thrown — the TTL remains as
   * a crash-safety net even if the Lua eval fails.
   */
  async releaseLock(key: string, token: string): Promise<void> {
    try {
      const client = this.redisService.getClient();
      await client.eval(RELEASE_LOCK_LUA, 1, key, token);
    } catch (err) {
      this.logger.error(`releaseLock(${key}) failed`, err as Error);
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
