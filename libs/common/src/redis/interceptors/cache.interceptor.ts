import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Reflector } from '@nestjs/core';
import { RedisService } from '../redis.service';
import {
  CACHE_KEY_METADATA,
  CACHE_TTL_METADATA,
} from '../decorators/cache.decorator';

@Injectable()
export class CacheInterceptor implements NestInterceptor {
  constructor(
    private readonly redisService: RedisService,
    private readonly reflector: Reflector,
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<any>> {
    const cacheKey = this.reflector.get<string>(
      CACHE_KEY_METADATA,
      context.getHandler(),
    );
    const cacheTTL = this.reflector.get<number>(
      CACHE_TTL_METADATA,
      context.getHandler(),
    );

    if (!cacheKey) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest();
    const key = this.generateCacheKey(cacheKey, request);

    // Try to get from cache
    const cachedData = await this.redisService.get(key);
    if (cachedData) {
      return of(cachedData);
    }

    // If not in cache, execute and cache the result
    return next.handle().pipe(
      tap(async (data: any) => {
        await this.redisService.set(key, data, cacheTTL);
      }),
    );
  }

  private generateCacheKey(baseKey: string, request: any): string {
    const userId = request.user?.id || 'anonymous';
    const params = JSON.stringify(request.params || {});
    const query = JSON.stringify(request.query || {});
    return `${baseKey}:${userId}:${params}:${query}`;
  }
}
