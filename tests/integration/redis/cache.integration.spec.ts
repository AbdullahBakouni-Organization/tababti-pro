/**
 * Integration tests — CacheService (Redis-backed, two-layer cache)
 *
 * What is tested here:
 *   - set() stores a value retrievable by get() (both memory and Redis layers).
 *   - get() returns null on cache miss.
 *   - invalidate() removes a key from both layers.
 *   - invalidatePattern() removes all matching keys from both layers.
 *   - del() is an alias for invalidate().
 *   - TTL is respected: a key set with a very short Redis TTL expires.
 *   - Redis raw operations via RedisService (set/get/del/exists/ttl).
 *
 * NOTE on keyPrefix:
 *   RedisModule is configured WITHOUT a keyPrefix here. The k() helper already
 *   namespaces every key with KEY_PREFIX, so there is no need for ioredis-level
 *   prefixing. Using keyPrefix together with k() would cause double-prefixing:
 *   ioredis prepends the prefix to keys passed to set/get, but client.keys()
 *   returns the full Redis key names (already prefixed), and the subsequent
 *   client.del() call re-adds the prefix — meaning the wrong keys are deleted.
 */

import { Test, TestingModule } from '@nestjs/testing';

import { CacheService } from '@app/common/cache/cache.service';
import { RedisModule } from '@app/common/redis/redis.module';
import { RedisService } from '@app/common/redis/redis.service';

const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = Number(process.env.REDIS_PORT || 6379);

/** Unique key prefix per test run to prevent cross-test pollution. */
const KEY_PREFIX = `inttest:${Date.now()}:`;

/** Prefix every key with KEY_PREFIX for test isolation. */
function k(name: string) {
  return `${KEY_PREFIX}${name}`;
}

/** Wait for a given number of milliseconds. */
function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('CacheService (Integration)', () => {
  let module: TestingModule;
  let cacheService: CacheService;
  let redisService: RedisService;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [
        // No keyPrefix — k() already namespaces all keys.
        RedisModule.forRoot({
          host: REDIS_HOST,
          port: REDIS_PORT,
          password: process.env.REDIS_PASSWORD || undefined,
        }),
      ],
      providers: [CacheService],
    }).compile();

    await module.init();

    cacheService = module.get(CacheService);
    redisService = module.get(RedisService);
  });

  afterAll(async () => {
    await redisService.deletePattern(`${KEY_PREFIX}*`);
    await module.close();
  });

  afterEach(async () => {
    await redisService.deletePattern(`${KEY_PREFIX}*`);
  });

  // ── Basic get / set ───────────────────────────────────────────────────────

  describe('get() / set()', () => {
    it('returns null when key does not exist', async () => {
      const result = await cacheService.get(k('missing'));
      expect(result).toBeNull();
    });

    it('stores and retrieves a string value', async () => {
      await cacheService.set(k('str'), 'hello world');
      const result = await cacheService.get<string>(k('str'));
      expect(result).toBe('hello world');
    });

    it('stores and retrieves an object value', async () => {
      const payload = { userId: '123', name: 'Ahmad', active: true };
      await cacheService.set(k('obj'), payload);
      const result = await cacheService.get<typeof payload>(k('obj'));
      expect(result).toEqual(payload);
    });

    it('stores and retrieves an array value', async () => {
      const payload = [1, 2, 3, 'four'];
      await cacheService.set(k('arr'), payload);
      const result = await cacheService.get<typeof payload>(k('arr'));
      expect(result).toEqual(payload);
    });

    it('overwrites a previously stored value', async () => {
      await cacheService.set(k('overwrite'), 'first');
      await cacheService.set(k('overwrite'), 'second');
      const result = await cacheService.get<string>(k('overwrite'));
      expect(result).toBe('second');
    });
  });

  // ── TTL ───────────────────────────────────────────────────────────────────

  describe('TTL expiry', () => {
    it('key becomes unavailable in Redis after redisTTL expires', async () => {
      // Set with 1-second Redis TTL
      await cacheService.set(k('ttl-key'), 'temporary', 1, 1);

      // Immediately readable
      const before = await redisService.get(k('ttl-key'));
      expect(before).not.toBeNull();

      // After 1.2 s the Redis key should be gone
      await sleep(1_200);
      const after = await redisService.get(k('ttl-key'));
      expect(after).toBeNull();
    });
  });

  // ── invalidate / del ──────────────────────────────────────────────────────

  describe('invalidate()', () => {
    it('removes the key so subsequent get() returns null', async () => {
      await cacheService.set(k('to-remove'), 42);
      await cacheService.invalidate(k('to-remove'));
      const result = await cacheService.get(k('to-remove'));
      expect(result).toBeNull();
    });

    it('is idempotent — calling on a non-existent key does not throw', async () => {
      await expect(
        cacheService.invalidate(k('non-existent')),
      ).resolves.not.toThrow();
    });

    it('del() is an alias for invalidate()', async () => {
      await cacheService.set(k('alias'), 'value');
      await cacheService.del(k('alias'));
      const result = await cacheService.get(k('alias'));
      expect(result).toBeNull();
    });
  });

  // ── invalidatePattern ─────────────────────────────────────────────────────

  describe('invalidatePattern()', () => {
    it('removes all keys matching the glob pattern', async () => {
      await cacheService.set(k('user:1:profile'), { name: 'A' });
      await cacheService.set(k('user:1:bookings'), [1, 2]);
      await cacheService.set(k('user:2:profile'), { name: 'B' });
      await cacheService.set(k('doctor:1:profile'), { specialty: 'cardio' });

      // Invalidate all keys for user:1 only
      await cacheService.invalidatePattern(`${KEY_PREFIX}user:1:*`);

      expect(await cacheService.get(k('user:1:profile'))).toBeNull();
      expect(await cacheService.get(k('user:1:bookings'))).toBeNull();
      // user:2 and doctor:1 keys must still be present
      expect(await cacheService.get(k('user:2:profile'))).toEqual({
        name: 'B',
      });
      expect(await cacheService.get(k('doctor:1:profile'))).toEqual({
        specialty: 'cardio',
      });
    });
  });

  // ── RedisService raw operations ───────────────────────────────────────────

  describe('RedisService raw operations', () => {
    it('set / get / del cycle works correctly', async () => {
      await redisService.set(k('raw'), { data: 1 });
      expect(await redisService.get(k('raw'))).toEqual({ data: 1 });
      await redisService.del(k('raw'));
      expect(await redisService.get(k('raw'))).toBeNull();
    });

    it('exists() returns true for a key that was set', async () => {
      await redisService.set(k('exists'), 'yes');
      expect(await redisService.exists(k('exists'))).toBe(true);
    });

    it('exists() returns false for a key that does not exist', async () => {
      expect(await redisService.exists(k('missing-exists'))).toBe(false);
    });

    it('ttl() returns a positive number for a key with expiry', async () => {
      await redisService.set(k('ttl'), 'val', 60);
      const remaining = await redisService.ttl(k('ttl'));
      expect(remaining).toBeGreaterThan(0);
      expect(remaining).toBeLessThanOrEqual(60);
    });

    it('incr() atomically increments a counter', async () => {
      await redisService.set(k('counter'), 0);
      const a = await redisService.incr(k('counter'));
      const b = await redisService.incr(k('counter'));
      expect(a).toBe(1);
      expect(b).toBe(2);
    });

    it('hset / hget round-trip preserves the object', async () => {
      const value = { name: 'Slot A', price: 5000 };
      await redisService.hset(k('hash'), 'slot_1', value);
      const result = await redisService.hget<typeof value>(k('hash'), 'slot_1');
      expect(result).toEqual(value);
    });
  });
});
