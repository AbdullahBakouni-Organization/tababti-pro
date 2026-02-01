import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RedisService } from '../redis.service';

export const RATE_LIMIT_KEY = 'rate_limit';

export interface RateLimitOptions {
  points: number; // Number of requests
  duration: number; // Time window in seconds
  blockDuration?: number; // Block duration in seconds if exceeded
}

export const RateLimit = (options: RateLimitOptions) => {
  return (
    target: any,
    propertyKey?: string,
    descriptor?: PropertyDescriptor,
  ) => {
    if (descriptor) {
      Reflect.defineMetadata(RATE_LIMIT_KEY, options, descriptor.value);
      return descriptor;
    }
    Reflect.defineMetadata(RATE_LIMIT_KEY, options, target);
    return target;
  };
};

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly redisService: RedisService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const options =
      this.reflector.get<RateLimitOptions>(
        RATE_LIMIT_KEY,
        context.getHandler(),
      ) ||
      this.reflector.get<RateLimitOptions>(RATE_LIMIT_KEY, context.getClass());

    if (!options) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const identifier = this.getIdentifier(request);
    const key = `rate_limit:${identifier}`;
    const blockKey = `rate_limit_block:${identifier}`;

    // Check if blocked
    const isBlocked = await this.redisService.exists(blockKey);
    if (isBlocked) {
      const ttl = await this.redisService.ttl(blockKey);
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: `Too many requests. Try again in ${ttl} seconds`,
          retryAfter: ttl,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Get current count
    const current = await this.redisService.get<number>(key);
    const count = current || 0;

    if (count >= options.points) {
      // Block user if blockDuration is specified
      if (options.blockDuration) {
        await this.redisService.set(blockKey, true, options.blockDuration);
      }

      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Too many requests',
          retryAfter: options.duration,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Increment counter
    await this.redisService.incr(key);

    // Set expiry on first request
    if (count === 0) {
      await this.redisService.expire(key, options.duration);
    }

    return true;
  }

  private getIdentifier(request: any): string {
    // Try to get user ID, fall back to IP
    return request.user?.id || request.ip || 'anonymous';
  }
}
