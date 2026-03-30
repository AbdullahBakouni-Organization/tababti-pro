import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { HttpException, HttpStatus } from '@nestjs/common';
import {
  RateLimitGuard,
  RateLimitOptions,
  RATE_LIMIT_KEY,
} from './rate-limit.guard';
import { RedisService } from '../redis.service';
import { createMockRedisService } from '@app/common/testing';

describe('RateLimitGuard', () => {
  let guard: RateLimitGuard;
  let redisService: ReturnType<typeof createMockRedisService>;
  let reflector: jest.Mocked<Reflector>;

  const mockRequest = {
    user: { id: 'user-1' },
    ip: '127.0.0.1',
  };

  const makeContext = (request = mockRequest, handlerOptions?: RateLimitOptions, classOptions?: RateLimitOptions) => ({
    getHandler: jest.fn().mockReturnValue({}),
    getClass: jest.fn().mockReturnValue({}),
    switchToHttp: jest.fn().mockReturnValue({
      getRequest: jest.fn().mockReturnValue(request),
    }),
  });

  beforeEach(async () => {
    redisService = createMockRedisService();
    reflector = { get: jest.fn() } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RateLimitGuard,
        { provide: RedisService, useValue: redisService },
        { provide: Reflector, useValue: reflector },
      ],
    }).compile();

    guard = module.get<RateLimitGuard>(RateLimitGuard);
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  it('returns true when no rate limit options are configured', async () => {
    reflector.get.mockReturnValue(undefined);

    const result = await guard.canActivate(makeContext() as any);
    expect(result).toBe(true);
  });

  it('returns true when request count is below limit', async () => {
    const options: RateLimitOptions = { points: 10, duration: 60 };
    reflector.get.mockReturnValueOnce(options).mockReturnValueOnce(undefined);
    redisService.exists.mockResolvedValue(0); // not blocked
    redisService.get.mockResolvedValue(3); // current count = 3, limit = 10

    const result = await guard.canActivate(makeContext() as any);
    expect(result).toBe(true);
    expect(redisService.incr).toHaveBeenCalled();
  });

  it('throws 429 when user is blocked', async () => {
    const options: RateLimitOptions = { points: 10, duration: 60 };
    reflector.get.mockReturnValueOnce(options).mockReturnValueOnce(undefined);
    redisService.exists.mockResolvedValue(1); // blocked
    redisService.ttl.mockResolvedValue(45);

    await expect(guard.canActivate(makeContext() as any)).rejects.toThrow(
      HttpException,
    );
  });

  it('throws 429 when request count reaches the limit', async () => {
    const options: RateLimitOptions = { points: 5, duration: 60 };
    reflector.get.mockReturnValueOnce(options).mockReturnValueOnce(undefined);
    redisService.exists.mockResolvedValue(0); // not blocked
    redisService.get.mockResolvedValue(5); // count == limit

    await expect(guard.canActivate(makeContext() as any)).rejects.toThrow(
      HttpException,
    );
  });

  it('blocks user and throws 429 when blockDuration is specified', async () => {
    const options: RateLimitOptions = {
      points: 5,
      duration: 60,
      blockDuration: 300,
    };
    reflector.get.mockReturnValueOnce(options).mockReturnValueOnce(undefined);
    redisService.exists.mockResolvedValue(0);
    redisService.get.mockResolvedValue(5); // count >= limit

    await expect(guard.canActivate(makeContext() as any)).rejects.toThrow(
      HttpException,
    );

    expect(redisService.set).toHaveBeenCalledWith(
      expect.stringContaining('rate_limit_block:'),
      true,
      300,
    );
  });

  it('sets key expiry on first request (count === 0)', async () => {
    const options: RateLimitOptions = { points: 10, duration: 30 };
    reflector.get.mockReturnValueOnce(options).mockReturnValueOnce(undefined);
    redisService.exists.mockResolvedValue(0);
    redisService.get.mockResolvedValue(null); // no previous count

    await guard.canActivate(makeContext() as any);

    expect(redisService.expire).toHaveBeenCalledWith(
      expect.stringContaining('rate_limit:'),
      30,
    );
  });

  it('uses class-level options when handler has no options', async () => {
    const classOptions: RateLimitOptions = { points: 100, duration: 3600 };
    reflector.get
      .mockReturnValueOnce(undefined) // handler has no options
      .mockReturnValueOnce(classOptions); // class has options

    redisService.exists.mockResolvedValue(0);
    redisService.get.mockResolvedValue(5);

    const result = await guard.canActivate(makeContext() as any);
    expect(result).toBe(true);
  });

  it('uses IP as identifier when user is not authenticated', async () => {
    const unauthenticatedRequest = { ip: '192.168.1.1' };
    const options: RateLimitOptions = { points: 10, duration: 60 };
    reflector.get.mockReturnValueOnce(options).mockReturnValueOnce(undefined);
    redisService.exists.mockResolvedValue(0);
    redisService.get.mockResolvedValue(0);

    await guard.canActivate(makeContext(unauthenticatedRequest as any) as any);

    expect(redisService.incr).toHaveBeenCalledWith(
      expect.stringContaining('192.168.1.1'),
    );
  });
});
