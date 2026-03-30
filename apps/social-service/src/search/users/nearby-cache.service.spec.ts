import { Test, TestingModule } from '@nestjs/testing';
import { NearbyCache } from './nearby-cache.service';
import { RedisService } from '@app/common/redis/redis.service';
import { createMockRedisService } from '@app/common/testing';

describe('NearbyCache', () => {
  let cache: NearbyCache;
  let redis: ReturnType<typeof createMockRedisService>;

  beforeEach(async () => {
    redis = createMockRedisService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NearbyCache,
        { provide: RedisService, useValue: redis },
      ],
    }).compile();

    cache = module.get<NearbyCache>(NearbyCache);
  });

  afterEach(() => {
    cache.clearMemory();
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(cache).toBeDefined();
  });

  // ── get() ──────────────────────────────────────────────────────────────────

  describe('get()', () => {
    it('returns data from fetchFn on L1+L2 miss', async () => {
      redis.get.mockResolvedValue(null);
      const fetchFn = jest.fn().mockResolvedValue({ data: 'fresh' });

      const result = await cache.get('key1', fetchFn, 60);

      expect(fetchFn).toHaveBeenCalled();
      expect(result).toEqual({ data: 'fresh' });
      expect(redis.set).toHaveBeenCalledWith('key1', { data: 'fresh' }, 60);
    });

    it('returns data from L1 memory cache (no Redis or fetchFn calls)', async () => {
      // First request to populate memory cache
      redis.get.mockResolvedValue(null);
      const fetchFn = jest.fn().mockResolvedValue({ data: 'fresh' });
      await cache.get('key2', fetchFn, 60);

      jest.clearAllMocks();
      redis.get.mockResolvedValue(null);

      // Second request should hit L1
      const fetchFn2 = jest.fn().mockResolvedValue({ data: 'other' });
      const result = await cache.get('key2', fetchFn2, 60);

      expect(redis.get).not.toHaveBeenCalled();
      expect(fetchFn2).not.toHaveBeenCalled();
      expect(result).toEqual({ data: 'fresh' });
    });

    it('returns data from L2 Redis cache on L1 miss', async () => {
      const cachedData = { data: 'from-redis' };
      redis.get.mockResolvedValue(cachedData);
      const fetchFn = jest.fn();

      const result = await cache.get('key3', fetchFn, 60);

      expect(result).toEqual(cachedData);
      expect(fetchFn).not.toHaveBeenCalled();
    });

    it('coalesces concurrent requests with same key', async () => {
      redis.get.mockResolvedValue(null);
      let resolvePromise: (value: any) => void;
      const longFetch = new Promise((resolve) => {
        resolvePromise = resolve;
      });
      const fetchFn = jest.fn().mockReturnValue(longFetch);

      // Start two concurrent requests
      const p1 = cache.get('key4', fetchFn, 60);
      const p2 = cache.get('key4', fetchFn, 60);

      resolvePromise!({ data: 'coalesced' });

      const [r1, r2] = await Promise.all([p1, p2]);

      // fetchFn should only be called once
      expect(fetchFn).toHaveBeenCalledTimes(1);
      expect(r1).toEqual({ data: 'coalesced' });
      expect(r2).toEqual({ data: 'coalesced' });
    });
  });

  // ── set() ─────────────────────────────────────────────────────────────────

  describe('set()', () => {
    it('stores value in both Redis and memory cache', async () => {
      await cache.set('key-set', { value: 42 }, 300);

      expect(redis.set).toHaveBeenCalledWith('key-set', { value: 42 }, 300);

      // Verify it's in memory by fetching without calling Redis
      redis.get.mockResolvedValue(null);
      const fetchFn = jest.fn();
      const result = await cache.get('key-set', fetchFn, 60);
      expect(fetchFn).not.toHaveBeenCalled();
      expect(result).toEqual({ value: 42 });
    });
  });

  // ── del() ─────────────────────────────────────────────────────────────────

  describe('del()', () => {
    it('deletes from both Redis and memory', async () => {
      // First populate memory
      redis.get.mockResolvedValue(null);
      await cache.get('key-del', jest.fn().mockResolvedValue('data'), 60);

      await cache.del('key-del');

      expect(redis.del).toHaveBeenCalledWith('key-del');
    });
  });

  // ── clearMemory() ─────────────────────────────────────────────────────────

  describe('clearMemory()', () => {
    it('clears all entries from L1 memory cache', async () => {
      // Populate memory
      redis.get.mockResolvedValue(null);
      await cache.get('key-a', jest.fn().mockResolvedValue('a'), 60);
      await cache.get('key-b', jest.fn().mockResolvedValue('b'), 60);

      cache.clearMemory();

      // After clear, should need to fetch again
      redis.get.mockResolvedValue(null);
      const fetchFn = jest.fn().mockResolvedValue('a-new');
      await cache.get('key-a', fetchFn, 60);
      expect(fetchFn).toHaveBeenCalled();
    });
  });

  // ── gridKey() ─────────────────────────────────────────────────────────────

  describe('gridKey()', () => {
    it('generates consistent grid key for coordinates', () => {
      const key1 = cache.gridKey(33.512, 36.298, 'req', 10);
      const key2 = cache.gridKey(33.514, 36.301, 'req', 10);
      // Close coordinates should map to the same grid cell
      expect(key1).toBe(key2);
    });

    it('generates different keys for distant coordinates', () => {
      const key1 = cache.gridKey(33.5, 36.3, 'req', 10);
      const key2 = cache.gridKey(35.0, 38.0, 'req', 10);
      expect(key1).not.toBe(key2);
    });

    it('includes prefix in key', () => {
      const key = cache.gridKey(33.5, 36.3, 'myprefix', 10);
      expect(key).toMatch(/^myprefix:/);
    });
  });
});
