import { Test, TestingModule } from '@nestjs/testing';
import { AiWorkerService } from './ai-worker.service';
import { TranslationAiService } from '../translation-ai/translation-ai.service';

describe('AiWorkerService', () => {
  let service: AiWorkerService;
  let translationService: { transliterate: jest.Mock };

  const makeJob = (text: string) => ({
    id: 'job-1',
    data: { text },
    updateProgress: jest.fn().mockResolvedValue(undefined),
  });

  beforeEach(async () => {
    translationService = {
      transliterate: jest.fn().mockResolvedValue(['محمد', 'mohamad']),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiWorkerService,
        { provide: TranslationAiService, useValue: translationService },
      ],
    }).compile();

    service = module.get<AiWorkerService>(AiWorkerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─── process ──────────────────────────────────────────────────────────────

  describe('process()', () => {
    it('returns fallback variants for Arabic input (no Flask call)', async () => {
      const job = makeJob('محمد');

      const result = await service.process(job as any);

      expect(result).toContain('محمد');
      expect(translationService.transliterate).not.toHaveBeenCalled();
    });

    it('calls transliterate for English input', async () => {
      const job = makeJob('Mohammad');
      translationService.transliterate.mockResolvedValue(['محمد', 'محمود']);

      const result = await service.process(job as any);

      expect(translationService.transliterate).toHaveBeenCalledWith(
        'Mohammad',
        'en',
        'ar',
      );
      expect(result).toContain('Mohammad');
    });

    it('returns safe fallback when transliterate throws', async () => {
      const job = makeJob('Ahmad');
      translationService.transliterate.mockRejectedValue(
        new Error('Flask down'),
      );

      const result = await service.process(job as any);

      // Should not throw — fallback handles error
      expect(result).toContain('Ahmad');
    });

    it('deduplicates results', async () => {
      const job = makeJob('Ahmad');
      translationService.transliterate.mockResolvedValue([
        'Ahmad',
        'ahmad',
        'Ahmad',
      ]);

      const result = await service.process(job as any);

      const unique = new Set(result);
      expect(unique.size).toBe(result.length);
    });

    it('limits results to max 7 variants', async () => {
      const job = makeJob('Test');
      translationService.transliterate.mockResolvedValue(
        Array.from({ length: 20 }, (_, i) => `variant${i}`),
      );

      const result = await service.process(job as any);

      expect(result.length).toBeLessThanOrEqual(7);
    });
  });
});
