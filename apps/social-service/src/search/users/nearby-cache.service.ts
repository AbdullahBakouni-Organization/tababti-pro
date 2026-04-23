import { Injectable, Logger } from '@nestjs/common';
import { LRUCache } from 'lru-cache';
import { RedisService } from '@app/common/redis/redis.service';

@Injectable()
export class NearbyCache {
  private readonly logger = new Logger(NearbyCache.name);
  private readonly MEMORY_TTL_MS = 60_000;

  private readonly memory: LRUCache<string, any>;
  private readonly inflight = new Map<string, Promise<any>>();

  constructor(private readonly redis: RedisService) {
    this.memory = new LRUCache({
      max: 1000,
      ttl: this.MEMORY_TTL_MS,
      updateAgeOnGet: true,
    });
  }

  /**
   * L1 (memory) → L2 (Redis) → fetchFn, with request coalescing.
   */
  async get<T>(
    key: string,
    fetchFn: () => Promise<T>,
    redisTTL: number,
  ): Promise<T> {
    // L1
    const mem = this.memory.get(key);
    if (mem !== undefined) {
      this.logger.debug(`L1 HIT  ${key}`);
      return mem;
    }

    // L2
    const cached = await this.redis.get<T>(key);
    if (cached) {
      this.logger.debug(`L2 HIT  ${key}`);
      this.memory.set(key, cached);
      return cached;
    }

    // Coalesce duplicate in-flight requests
    if (this.inflight.has(key)) {
      this.logger.debug(`COALESCED  ${key}`);
      return this.inflight.get(key) as Promise<T>;
    }

    this.logger.debug(`MISS  ${key}`);
    const promise = fetchFn()
      .then(async (data) => {
        await this.redis.set(key, data, redisTTL);
        this.memory.set(key, data);
        return data;
      })
      .finally(() => this.inflight.delete(key));

    this.inflight.set(key, promise);
    return promise;
  }

  /** Store directly in both layers (e.g. after background recompute). */
  async set(key: string, value: any, redisTTL: number): Promise<void> {
    await this.redis.set(key, value, redisTTL);
    this.memory.set(key, value);
  }

  async del(key: string): Promise<void> {
    await this.redis.del(key);
    this.memory.delete(key);
  }

  /**
   * Nukes every Redis key that matches the glob pattern (SCAN-based, so safe
   * on large keyspaces) and clears the local in-memory LRU. Memory clear is
   * intentionally global rather than key-matched: the LRU is tiny (1000
   * entries, 60s TTL) so a full clear is cheaper than key-by-key matching,
   * and remote pods rely on the 60s TTL to converge since this instance can't
   * reach across the process boundary.
   */
  async invalidatePattern(pattern: string): Promise<void> {
    await this.redis.deletePattern(pattern);
    this.memory.clear();
  }

  clearMemory(): void {
    this.memory.clear();
  }

  // ─── Cache key helpers ────────────────────────────────────────────────────

  /** Snaps lat/lng to a grid cell to reuse cache for nearby coordinates. */
  gridKey(lat: number, lng: number, prefix: string, precision = 10): string {
    const size = 0.1 / precision;
    const gLat = (Math.round(lat / size) * size).toFixed(3);
    const gLng = (Math.round(lng / size) * size).toFixed(3);
    return `${prefix}:${gLat},${gLng}`;
  }
}
