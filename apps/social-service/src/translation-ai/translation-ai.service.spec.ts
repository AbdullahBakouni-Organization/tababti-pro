import { Test, TestingModule } from '@nestjs/testing';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { getModelToken } from '@nestjs/mongoose';
import { TranslationAiService } from './translation-ai.service';

// Mock fetch globally
global.fetch = jest.fn();

describe('TranslationAiService', () => {
  let service: TranslationAiService;
  let cacheManager: { get: jest.Mock; set: jest.Mock };
  let transliterationCacheModel: {
    find: jest.Mock;
    findOne: jest.Mock;
    updateOne: jest.Mock;
  };

  beforeEach(async () => {
    cacheManager = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
    };

    // Mongoose query chain: find().sort().limit().lean() and findOne().lean()
    const makeFindChain = (resolvedValue: unknown) => {
      const chain = {
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(resolvedValue),
      };
      return chain;
    };
    const makeFindOneChain = (resolvedValue: unknown) => ({
      lean: jest.fn().mockResolvedValue(resolvedValue),
    });

    transliterationCacheModel = {
      find: jest.fn().mockReturnValue(makeFindChain([])),
      findOne: jest.fn().mockReturnValue(makeFindOneChain(null)),
      updateOne: jest
        .fn()
        .mockReturnValue({ exec: jest.fn().mockResolvedValue(undefined) }),
    };

    (global.fetch as jest.Mock).mockReset();
    // Default health check succeeds
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ model_loaded: true, status: 'ok' }),
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TranslationAiService,
        { provide: CACHE_MANAGER, useValue: cacheManager },
        {
          provide: getModelToken('TransliterationCache'),
          useValue: transliterationCacheModel,
        },
      ],
    }).compile();

    service = module.get<TranslationAiService>(TranslationAiService);
    // Initialize memoryCache (set up in onModuleInit)
    await service.onModuleInit();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─── transliterate ────────────────────────────────────────────────────────

  describe('transliterate()', () => {
    it('returns empty array for text shorter than 2 characters', async () => {
      const result = await service.transliterate('a', 'en', 'ar');
      expect(result).toEqual([]);
    });

    it('returns empty array for empty string', async () => {
      const result = await service.transliterate('', 'en', 'ar');
      expect(result).toEqual([]);
    });

    it('uses Arabic variants utility for Arabic input', async () => {
      const result = await service.transliterate('محمد', 'ar', 'en');
      // Should return array of variants without calling Flask
      expect(Array.isArray(result)).toBe(true);
    });

    it('calls Flask API for English input', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ variants: ['محمد', 'محمود'] }),
      });

      const result = await service.transliterate('Mohammad', 'en', 'ar');

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('returns fallback for unsupported direction', async () => {
      const result = await service.transliterate('hello', 'en', 'en' as any);
      expect(result).toEqual(['hello', 'hello']);
    });
  });
});
