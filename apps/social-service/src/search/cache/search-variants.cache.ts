import { Injectable } from '@nestjs/common';
import { LRUCache } from 'lru-cache';

@Injectable()
export class SearchVariantsCache {
  private readonly cache = new LRUCache<string, string[]>({
    max: 5000,
    ttl: 1000 * 60 * 60 * 24,
  });

  private normalizeArabic(text: string): string {
    return text
      .replace(/[\u064B-\u065F]/g, '')
      .replace(/\s+/g, '')
      .replace(/[أإآٱ]/g, 'ا')
      .replace(/[ى]/g, 'ي')
      .replace(/[ة]/g, 'ه')
      .replace(/[ؤ]/g, 'و')
      .replace(/[ئ]/g, 'ي')
      .trim()
      .toLowerCase();
  }

  get(term: string): string[] | undefined {
    return this.cache.get(this.normalizeArabic(term));
  }

  set(term: string, variants: string[], ttl?: number) {
    this.cache.set(
      this.normalizeArabic(term),
      variants,
      ttl ? { ttl } : undefined,
    );
  }

  has(term: string): boolean {
    return this.cache.has(this.normalizeArabic(term));
  }

  clear() {
    this.cache.clear();
  }

  size() {
    return this.cache.size;
  }

  async hydrate(terms: string[]) {
    for (const term of terms) {
      if (!this.has(term)) this.set(term, [term]);
    }
  }

  getNonBlocking(term: string): string[] {
    const cached = this.get(term);
    if (cached) return cached;
    return this.getEssentialPhoneticVariants(term);
  }

  private getEssentialPhoneticVariants(term: string): string[] {
    const normalized = this.normalizeArabic(term);
    const variants = new Set<string>([
      term,
      normalized,
      normalized.replace(/ا/g, 'أ'),
      normalized.replace(/ه/g, 'ة'),
      normalized.replace(/ي/g, 'ى'),
    ]);
    return Array.from(variants).slice(0, 7);
  }
}
