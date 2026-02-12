import { Test, TestingModule } from '@nestjs/testing';
import { TranslationAiService } from './translation-ai.service';

describe('TranslationAiService', () => {
  let service: TranslationAiService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TranslationAiService],
    }).compile();

    service = module.get<TranslationAiService>(TranslationAiService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
