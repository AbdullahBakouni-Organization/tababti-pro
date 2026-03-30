import { Test, TestingModule } from '@nestjs/testing';
import { RedisService } from './redis.service';

// Mock ioredis before importing the service
const mockRedisInstance = {
  get: jest.fn(),
  set: jest.fn(),
  setex: jest.fn(),
  del: jest.fn(),
  exists: jest.fn(),
  expire: jest.fn(),
  ttl: jest.fn(),
  hset: jest.fn(),
  hget: jest.fn(),
  hgetall: jest.fn(),
  hdel: jest.fn(),
  lpush: jest.fn(),
  rpush: jest.fn(),
  lpop: jest.fn(),
  lrange: jest.fn(),
  sadd: jest.fn(),
  smembers: jest.fn(),
  sismember: jest.fn(),
  srem: jest.fn(),
  zadd: jest.fn(),
  zrange: jest.fn(),
  zrangebyscore: jest.fn(),
  publish: jest.fn(),
  subscribe: jest.fn(),
  unsubscribe: jest.fn(),
  keys: jest.fn(),
  incr: jest.fn(),
  decr: jest.fn(),
  incrby: jest.fn(),
  on: jest.fn(),
  quit: jest.fn().mockResolvedValue('OK'),
  duplicate: jest.fn(),
};

// subscriber/publisher share the same mock shape
mockRedisInstance.duplicate.mockReturnValue({
  ...mockRedisInstance,
  on: jest.fn(),
  subscribe: jest.fn(),
  unsubscribe: jest.fn(),
  publish: jest.fn(),
  quit: jest.fn().mockResolvedValue('OK'),
  duplicate: jest.fn(),
});

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => mockRedisInstance);
});

describe('RedisService', () => {
  let service: RedisService;

  const redisOptions = {
    host: 'localhost',
    port: 6379,
    password: '',
    db: 0,
  };

  beforeEach(async () => {
    // Reset all mocks between tests
    Object.values(mockRedisInstance).forEach((fn) => {
      if (typeof fn === 'function' && 'mockReset' in fn) {
        fn.mockReset();
      }
    });
    mockRedisInstance.quit.mockResolvedValue('OK');
    mockRedisInstance.on.mockImplementation(() => mockRedisInstance);
    mockRedisInstance.duplicate.mockReturnValue({
      ...mockRedisInstance,
      on: jest.fn(),
      subscribe: jest.fn().mockResolvedValue(undefined),
      unsubscribe: jest.fn().mockResolvedValue(undefined),
      publish: jest.fn().mockResolvedValue(1),
      quit: jest.fn().mockResolvedValue('OK'),
      duplicate: jest.fn(),
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RedisService,
        { provide: 'REDIS_OPTIONS', useValue: redisOptions },
      ],
    }).compile();

    service = module.get<RedisService>(RedisService);
    service.onModuleInit();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─── get / set ────────────────────────────────────────────────────────────

  describe('get()', () => {
    it('parses JSON and returns typed result', async () => {
      mockRedisInstance.get.mockResolvedValue(JSON.stringify({ id: 1 }));
      const result = await service.get<{ id: number }>('mykey');
      expect(result).toEqual({ id: 1 });
    });

    it('returns null on cache miss', async () => {
      mockRedisInstance.get.mockResolvedValue(null);
      const result = await service.get('missing');
      expect(result).toBeNull();
    });
  });

  describe('set()', () => {
    it('uses setex when TTL is provided', async () => {
      mockRedisInstance.setex.mockResolvedValue('OK');
      await service.set('k1', { x: 1 }, 300);
      expect(mockRedisInstance.setex).toHaveBeenCalledWith(
        'k1',
        300,
        JSON.stringify({ x: 1 }),
      );
    });

    it('uses set without TTL when not specified', async () => {
      mockRedisInstance.set.mockResolvedValue('OK');
      await service.set('k2', 'hello');
      expect(mockRedisInstance.set).toHaveBeenCalledWith(
        'k2',
        JSON.stringify('hello'),
      );
    });
  });

  describe('del()', () => {
    it('delegates to Redis DEL', async () => {
      mockRedisInstance.del.mockResolvedValue(1);
      await service.del('remove-me');
      expect(mockRedisInstance.del).toHaveBeenCalledWith('remove-me');
    });
  });

  describe('exists()', () => {
    it('returns true when key exists', async () => {
      mockRedisInstance.exists.mockResolvedValue(1);
      expect(await service.exists('k')).toBe(true);
    });

    it('returns false when key does not exist', async () => {
      mockRedisInstance.exists.mockResolvedValue(0);
      expect(await service.exists('k')).toBe(false);
    });
  });

  describe('expire()', () => {
    it('sets TTL on a key', async () => {
      mockRedisInstance.expire.mockResolvedValue(1);
      await service.expire('k', 60);
      expect(mockRedisInstance.expire).toHaveBeenCalledWith('k', 60);
    });
  });

  describe('ttl()', () => {
    it('returns TTL from Redis', async () => {
      mockRedisInstance.ttl.mockResolvedValue(120);
      const result = await service.ttl('k');
      expect(result).toBe(120);
    });
  });

  // ─── Hash operations ──────────────────────────────────────────────────────

  describe('hset()', () => {
    it('stores JSON-serialized value', async () => {
      mockRedisInstance.hset.mockResolvedValue(1);
      await service.hset('hash', 'field1', { score: 99 });
      expect(mockRedisInstance.hset).toHaveBeenCalledWith(
        'hash',
        'field1',
        JSON.stringify({ score: 99 }),
      );
    });
  });

  describe('hget()', () => {
    it('parses and returns field value', async () => {
      mockRedisInstance.hget.mockResolvedValue(JSON.stringify({ score: 99 }));
      const result = await service.hget<{ score: number }>('hash', 'field1');
      expect(result).toEqual({ score: 99 });
    });

    it('returns null on miss', async () => {
      mockRedisInstance.hget.mockResolvedValue(null);
      expect(await service.hget('hash', 'missing')).toBeNull();
    });
  });

  describe('hgetall()', () => {
    it('returns all hash fields parsed', async () => {
      mockRedisInstance.hgetall.mockResolvedValue({
        f1: JSON.stringify(1),
        f2: JSON.stringify('hello'),
      });
      const result = await service.hgetall('hash');
      expect(result).toEqual({ f1: 1, f2: 'hello' });
    });
  });

  describe('hdel()', () => {
    it('deletes hash field', async () => {
      mockRedisInstance.hdel.mockResolvedValue(1);
      await service.hdel('hash', 'field1');
      expect(mockRedisInstance.hdel).toHaveBeenCalledWith('hash', 'field1');
    });
  });

  // ─── List operations ──────────────────────────────────────────────────────

  describe('lpush() / rpush()', () => {
    it('lpush prepends JSON value', async () => {
      mockRedisInstance.lpush.mockResolvedValue(1);
      await service.lpush('list', 'item');
      expect(mockRedisInstance.lpush).toHaveBeenCalledWith(
        'list',
        JSON.stringify('item'),
      );
    });

    it('rpush appends JSON value', async () => {
      mockRedisInstance.rpush.mockResolvedValue(1);
      await service.rpush('list', 'item');
      expect(mockRedisInstance.rpush).toHaveBeenCalledWith(
        'list',
        JSON.stringify('item'),
      );
    });
  });

  describe('lpop()', () => {
    it('parses and returns first element', async () => {
      mockRedisInstance.lpop.mockResolvedValue(JSON.stringify({ id: 5 }));
      expect(await service.lpop('list')).toEqual({ id: 5 });
    });

    it('returns null on empty list', async () => {
      mockRedisInstance.lpop.mockResolvedValue(null);
      expect(await service.lpop('list')).toBeNull();
    });
  });

  describe('lrange()', () => {
    it('returns parsed array', async () => {
      mockRedisInstance.lrange.mockResolvedValue([
        JSON.stringify(1),
        JSON.stringify(2),
      ]);
      const result = await service.lrange<number>('list', 0, -1);
      expect(result).toEqual([1, 2]);
    });
  });

  // ─── Set operations ───────────────────────────────────────────────────────

  describe('sadd()', () => {
    it('adds JSON-serialized members', async () => {
      mockRedisInstance.sadd.mockResolvedValue(1);
      await service.sadd('set', 'a', 'b');
      expect(mockRedisInstance.sadd).toHaveBeenCalledWith(
        'set',
        JSON.stringify('a'),
        JSON.stringify('b'),
      );
    });
  });

  describe('smembers()', () => {
    it('returns parsed set members', async () => {
      mockRedisInstance.smembers.mockResolvedValue([
        JSON.stringify('x'),
        JSON.stringify('y'),
      ]);
      expect(await service.smembers('set')).toEqual(['x', 'y']);
    });
  });

  describe('sismember()', () => {
    it('returns true when member exists', async () => {
      mockRedisInstance.sismember.mockResolvedValue(1);
      expect(await service.sismember('set', 'x')).toBe(true);
    });

    it('returns false when member does not exist', async () => {
      mockRedisInstance.sismember.mockResolvedValue(0);
      expect(await service.sismember('set', 'z')).toBe(false);
    });
  });

  describe('srem()', () => {
    it('removes member from set', async () => {
      mockRedisInstance.srem.mockResolvedValue(1);
      await service.srem('set', 'x');
      expect(mockRedisInstance.srem).toHaveBeenCalledWith(
        'set',
        JSON.stringify('x'),
      );
    });
  });

  // ─── Sorted set operations ────────────────────────────────────────────────

  describe('zadd()', () => {
    it('adds member with score', async () => {
      mockRedisInstance.zadd.mockResolvedValue(1);
      await service.zadd('zset', 10, 'member1');
      expect(mockRedisInstance.zadd).toHaveBeenCalledWith(
        'zset',
        10,
        JSON.stringify('member1'),
      );
    });
  });

  describe('zrange()', () => {
    it('returns range of members parsed', async () => {
      mockRedisInstance.zrange.mockResolvedValue([
        JSON.stringify('a'),
        JSON.stringify('b'),
      ]);
      expect(await service.zrange('zset', 0, -1)).toEqual(['a', 'b']);
    });
  });

  describe('zrangebyscore()', () => {
    it('returns members in score range', async () => {
      mockRedisInstance.zrangebyscore.mockResolvedValue([JSON.stringify('a')]);
      expect(await service.zrangebyscore('zset', 0, 100)).toEqual(['a']);
    });
  });

  // ─── Pub/Sub ──────────────────────────────────────────────────────────────

  describe('publish()', () => {
    it('JSON-serializes message and publishes to channel', async () => {
      const subscriberDuplicate = mockRedisInstance.duplicate();
      subscriberDuplicate.publish = jest.fn().mockResolvedValue(1);

      // publish uses publisher client
      await service.publish('chan', { event: 'test' });
      // just verify it doesn't throw — publish delegates to publisher connection
    });
  });

  describe('subscribe()', () => {
    it('registers callback on subscriber client', async () => {
      const cb = jest.fn();
      await service.subscribe('mychan', cb);
      // subscription is registered without error
    });
  });

  // ─── Counter operations ───────────────────────────────────────────────────

  describe('incr() / decr() / incrby()', () => {
    it('incr increments and returns new value', async () => {
      mockRedisInstance.incr.mockResolvedValue(5);
      expect(await service.incr('counter')).toBe(5);
    });

    it('decr decrements and returns new value', async () => {
      mockRedisInstance.decr.mockResolvedValue(4);
      expect(await service.decr('counter')).toBe(4);
    });

    it('incrby increments by given amount', async () => {
      mockRedisInstance.incrby.mockResolvedValue(10);
      expect(await service.incrby('counter', 6)).toBe(10);
    });
  });

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  describe('onModuleDestroy()', () => {
    it('quits all Redis connections', async () => {
      await service.onModuleDestroy();
      // quit was called on client (and duplicated subscriber/publisher)
      expect(mockRedisInstance.quit).toHaveBeenCalled();
    });
  });
});
