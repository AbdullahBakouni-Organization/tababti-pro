import { Test, TestingModule } from '@nestjs/testing';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';

const mockSearchService = {
  searchAll: jest.fn().mockResolvedValue({ data: [], total: 0 }),
  getSimilarDoctors: jest
    .fn()
    .mockResolvedValue({ doctors: { data: [] }, meta: { total: 0 } }),
  clearCache: jest.fn(),
};

describe('SearchController', () => {
  let controller: SearchController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SearchController],
      providers: [{ provide: SearchService, useValue: mockSearchService }],
    }).compile();

    controller = module.get<SearchController>(SearchController);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('filterDoctors() delegates to searchService.searchAll', async () => {
    const dto = { query: 'cardiologist' } as any;
    await controller.filterDoctors(dto);
    expect(mockSearchService.searchAll).toHaveBeenCalledWith(dto);
  });

  it('getSimilarDoctors() calls service with dto and authAccountId', async () => {
    const dto = { doctorId: 'doc-1', page: 1, limit: 5 } as any;
    const authAccountId = 'account-1';
    await controller.getSimilarDoctors(dto, authAccountId);
    expect(mockSearchService.getSimilarDoctors).toHaveBeenCalledWith(
      dto,
      authAccountId,
    );
  });

  it('clearCache() calls searchService.clearCache and returns message', () => {
    const result = controller.clearCache();
    expect(mockSearchService.clearCache).toHaveBeenCalled();
    expect(result).toMatchObject({ message: expect.any(String) });
  });
});
