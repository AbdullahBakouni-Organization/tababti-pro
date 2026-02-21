import { Injectable } from '@nestjs/common';
import { LRUCache } from 'lru-cache';

@Injectable()
export class SearchVariantsCache {
  private readonly cache = new LRUCache<string, string[]>({
    max: 5000,
    ttl: 1000 * 60 * 60 * 24,
  });

  get(term: string): string[] | undefined {
    return this.cache.get(term.toLowerCase().trim());
  }

  set(term: string, variants: string[], ttl?: number) {
    this.cache.set(
      term.toLowerCase().trim(),
      variants,
      ttl ? { ttl } : undefined,
    );
  }

  has(term: string): boolean {
    return this.cache.has(term.toLowerCase().trim());
  }

  clear() {
    this.cache.clear();
  }
}
