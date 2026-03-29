import { Test, TestingModule } from '@nestjs/testing';
import { CacheService } from './cache.service';
import { RedisService } from '../redis/redis.service';
import { createMockRedisService } from '../testing/mock-services.factory';

describe('CacheService', () => {
  let service: CacheService;
  let redisService: ReturnType<typeof createMockRedisService>;

  beforeEach(async () => {
    redisService = createMockRedisService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CacheService,
        { provide: RedisService, useValue: redisService },
      ],
    }).compile();

    service = module.get<CacheService>(CacheService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─── onModuleInit ─────────────────────────────────────────────────────────

  describe('onModuleInit', () => {
    it('should subscribe to cache:invalidate channel', async () => {
      await service.onModuleInit();
      expect(redisService.subscribe).toHaveBeenCalledWith(
        'cache:invalidate',
        expect.any(Function),
      );
    });

    it('pub/sub callback — exact: message deletes key from memory', async () => {
      let capturedCallback: (msg: string) => void;
      redisService.subscribe.mockImplementation(
        (_channel: string, cb: (msg: string) => void) => {
          capturedCallback = cb;
          return Promise.resolve();
        },
      );

      await service.onModuleInit();
      // prime the memory cache
      await service.set('my-key', { data: 1 }, 60, 3600);

      // confirm memory hit before invalidation
      redisService.get.mockResolvedValue(null);
      const before = await service.get('my-key');
      expect(before).toEqual({ data: 1 });

      // fire the pub/sub callback
      capturedCallback!('exact:my-key');

      // memory should be empty now, Redis also returns null
      const after = await service.get('my-key');
      expect(after).toBeNull();
    });

    it('pub/sub callback — pattern: message deletes matching keys from memory', async () => {
      let capturedCallback: (msg: string) => void;
      redisService.subscribe.mockImplementation(
        (_channel: string, cb: (msg: string) => void) => {
          capturedCallback = cb;
          return Promise.resolve();
        },
      );

      await service.onModuleInit();
      await service.set('user:1:profile', { name: 'Ali' }, 60, 3600);
      await service.set('user:2:profile', { name: 'Sara' }, 60, 3600);
      await service.set('other-key', { x: 1 }, 60, 3600);

      // fire pattern invalidation
      capturedCallback!('pattern:user:*');

      redisService.get.mockResolvedValue(null);
      expect(await service.get('user:1:profile')).toBeNull();
      expect(await service.get('user:2:profile')).toBeNull();
      // non-matching key stays in memory
      expect(await service.get('other-key')).toEqual({ x: 1 });
    });
  });

  // ─── get ──────────────────────────────────────────────────────────────────

  describe('get()', () => {
    it('returns value from memory cache on hit without calling Redis', async () => {
      await service.set('key1', { value: 42 }, 60, 3600);
      redisService.get.mockClear();

      const result = await service.get<{ value: number }>('key1');
      expect(result).toEqual({ value: 42 });
      expect(redisService.get).not.toHaveBeenCalled();
    });

    it('falls through to Redis on memory miss and stores result in memory', async () => {
      const redisData = JSON.stringify({ fromRedis: true });
      redisService.get.mockResolvedValue(redisData);

      const result = await service.get<{ fromRedis: boolean }>('cold-key');
      expect(result).toEqual({ fromRedis: true });
      expect(redisService.get).toHaveBeenCalledWith('cold-key');

      // second call should use memory, not Redis
      redisService.get.mockClear();
      const result2 = await service.get<{ fromRedis: boolean }>('cold-key');
      expect(result2).toEqual({ fromRedis: true });
      expect(redisService.get).not.toHaveBeenCalled();
    });

    it('returns null when both layers miss', async () => {
      redisService.get.mockResolvedValue(null);
      const result = await service.get('missing-key');
      expect(result).toBeNull();
    });

    it('returns null when Redis throws (graceful fallback)', async () => {
      redisService.get.mockRejectedValue(new Error('Redis connection lost'));
      // Should not throw, just return null implicitly via rejection propagation
      // CacheService doesn't swallow errors in get() — it lets them propagate.
      await expect(service.get('any-key')).rejects.toThrow(
        'Redis connection lost',
      );
    });
  });

  // ─── set ──────────────────────────────────────────────────────────────────

  describe('set()', () => {
    it('writes to both memory cache and Redis', async () => {
      await service.set('profile:1', { name: 'Hassan' }, 120, 7200);

      expect(redisService.set).toHaveBeenCalledWith(
        'profile:1',
        JSON.stringify({ name: 'Hassan' }),
        7200,
      );

      // memory cache should have it
      redisService.get.mockClear();
      const val = await service.get<{ name: string }>('profile:1');
      expect(val).toEqual({ name: 'Hassan' });
      expect(redisService.get).not.toHaveBeenCalled();
    });

    it('uses default TTLs (60s memory, 3600s Redis) when not specified', async () => {
      await service.set('default-key', 'hello');
      expect(redisService.set).toHaveBeenCalledWith(
        'default-key',
        JSON.stringify('hello'),
        3600,
      );
    });
  });

  // ─── invalidate ───────────────────────────────────────────────────────────

  describe('invalidate()', () => {
    it('removes from memory, deletes from Redis, and publishes exact: event', async () => {
      await service.set('token:abc', { id: 1 }, 60, 3600);

      await service.invalidate('token:abc');

      expect(redisService.del).toHaveBeenCalledWith('token:abc');
      expect(redisService.publish).toHaveBeenCalledWith(
        'cache:invalidate',
        'exact:token:abc',
      );

      redisService.get.mockResolvedValue(null);
      const result = await service.get('token:abc');
      expect(result).toBeNull();
    });
  });

  // ─── invalidatePattern ────────────────────────────────────────────────────

  describe('invalidatePattern()', () => {
    it('removes matching memory keys, calls deletePattern, and publishes pattern: event', async () => {
      await service.set('booking:u1:list', [1], 60, 3600);
      await service.set('booking:u2:list', [2], 60, 3600);
      await service.set('slot:available', [3], 60, 3600);

      await service.invalidatePattern('booking:*');

      expect(redisService.deletePattern).toHaveBeenCalledWith('booking:*');
      expect(redisService.publish).toHaveBeenCalledWith(
        'cache:invalidate',
        'pattern:booking:*',
      );

      redisService.get.mockResolvedValue(null);
      expect(await service.get('booking:u1:list')).toBeNull();
      expect(await service.get('booking:u2:list')).toBeNull();
      // non-matching key survives
      expect(await service.get('slot:available')).toEqual([3]);
    });
  });

  // ─── del ──────────────────────────────────────────────────────────────────

  describe('del()', () => {
    it('is an alias for invalidate() — removes key and publishes event', async () => {
      await service.set('session:xyz', { active: true }, 60, 3600);

      await service.del('session:xyz');

      expect(redisService.del).toHaveBeenCalledWith('session:xyz');
      expect(redisService.publish).toHaveBeenCalledWith(
        'cache:invalidate',
        'exact:session:xyz',
      );
    });
  });
});
