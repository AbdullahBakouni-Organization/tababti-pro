import { Test, TestingModule } from '@nestjs/testing';
import { AiWorkerService } from './ai-worker.service';

describe('AiWorkerService', () => {
  let service: AiWorkerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AiWorkerService],
    }).compile();

    service = module.get<AiWorkerService>(AiWorkerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
