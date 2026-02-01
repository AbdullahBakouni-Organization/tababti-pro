import { SetMetadata } from '@nestjs/common';

export const CACHE_KEY_METADATA = 'cache:key';
export const CACHE_TTL_METADATA = 'cache:ttl';

export interface CacheOptions {
  key?: string;
  ttl?: number; // seconds
}

export const Cache = (options?: CacheOptions) => {
  return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
    SetMetadata(CACHE_KEY_METADATA, options?.key || propertyKey)(
      target,
      propertyKey,
      descriptor,
    );
    SetMetadata(CACHE_TTL_METADATA, options?.ttl || 300)(
      target,
      propertyKey,
      descriptor,
    );
    return descriptor;
  };
};
