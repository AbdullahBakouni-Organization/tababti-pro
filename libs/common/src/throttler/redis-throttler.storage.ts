import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ThrottlerStorage } from '@nestjs/throttler';
import type { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface';
import Redis from 'ioredis';

/**
 * ThrottlerStorage backed by Redis so rate-limit counters are shared across
 * all replicas (gateway + any microservice that exposes HTTP and enables the
 * throttler). The default `ThrottlerStorageService` is an in-memory `Map` —
 * each replica counts independently, which means the effective rate limit
 * scales with the number of instances.
 *
 * Contract (from @nestjs/throttler):
 *   - Return the cumulative hit count for the window.
 *   - Return the seconds remaining until the window expires.
 *   - Report blocked state if `totalHits > limit`, and for `blockDuration`
 *     seconds after the window expires.
 *
 * We implement this with two keys per `{ throttler, key }`:
 *   hitKey   → counter, TTL = ttl-seconds or blockDuration when blocked
 *   blockKey → present iff the caller is currently blocked, TTL = blockDuration
 */
@Injectable()
export class RedisThrottlerStorage
  implements ThrottlerStorage, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(RedisThrottlerStorage.name);
  private client!: Redis;

  constructor(@Inject(ConfigService) private readonly config: ConfigService) {}

  onModuleInit() {
    this.client = new Redis({
      host: this.config.get<string>('REDIS_HOST', 'localhost'),
      port: this.config.get<number>('REDIS_PORT', 6379),
      password: this.config.get<string>('REDIS_PASSWORD'),
      db: this.config.get<number>('REDIS_DB', 0),
      keyPrefix: 'throttle:',
      // Fail-open on Redis outage — better a brief lack of rate limiting than
      // a completely unavailable service.
      enableOfflineQueue: false,
      maxRetriesPerRequest: 2,
      retryStrategy: (times) => Math.min(times * 100, 2_000),
    });

    this.client.on('error', (err) => {
      this.logger.error(`Redis throttler storage error: ${err.message}`);
    });
  }

  async onModuleDestroy() {
    if (this.client) await this.client.quit();
  }

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const hitKey = `${throttlerName}:${key}:hits`;
    const blockKey = `${throttlerName}:${key}:blocked`;
    const ttlSeconds = Math.max(1, Math.ceil(ttl / 1000));
    const blockSeconds = Math.max(0, Math.ceil(blockDuration / 1000));

    try {
      const blockTtl = await this.client.pttl(blockKey);
      if (blockTtl > 0) {
        const hits = Number((await this.client.get(hitKey)) ?? limit);
        return {
          totalHits: hits,
          timeToExpire: Math.ceil(blockTtl / 1000),
          isBlocked: true,
          timeToBlockExpire: Math.ceil(blockTtl / 1000),
        };
      }

      // INCR + EXPIRE only when the counter is first set. Using a pipeline is
      // safe here because rate-limit accuracy allows minor jitter.
      const [hitsRaw, hitTtlRaw] = (await this.client
        .multi()
        .incr(hitKey)
        .pttl(hitKey)
        .exec()) as Array<[Error | null, number]>;

      const totalHits = hitsRaw?.[1] ?? 1;
      let hitTtl = hitTtlRaw?.[1] ?? -1;
      if (hitTtl < 0) {
        await this.client.expire(hitKey, ttlSeconds);
        hitTtl = ttlSeconds * 1000;
      }

      const isBlocked = totalHits > limit;
      if (isBlocked && blockSeconds > 0) {
        await this.client.set(blockKey, '1', 'EX', blockSeconds);
      }

      return {
        totalHits,
        timeToExpire: Math.ceil(hitTtl / 1000),
        isBlocked,
        timeToBlockExpire: isBlocked ? blockSeconds : 0,
      };
    } catch (err) {
      // Fail open: Redis unavailable → do not rate-limit (log once per window).
      this.logger.warn(
        `Throttler storage unavailable (${throttlerName}:${key}): ${(err as Error).message}`,
      );
      return {
        totalHits: 1,
        timeToExpire: ttlSeconds,
        isBlocked: false,
        timeToBlockExpire: 0,
      };
    }
  }
}
