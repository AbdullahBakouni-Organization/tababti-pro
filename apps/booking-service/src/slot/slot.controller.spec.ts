import { Test, TestingModule } from '@nestjs/testing';
import { SlotController } from './slot.controller';
import { SlotGenerationService } from './slot.service';

const mockSlotService = {
  getAvailableSlots: jest.fn().mockResolvedValue({
    clinic: { data: [], total: 0 },
    hospital: { data: [], total: 0 },
    center: { data: [], total: 0 },
  }),
};

describe('SlotController', () => {
  let controller: SlotController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SlotController],
      providers: [
        { provide: SlotGenerationService, useValue: mockSlotService },
      ],
    }).compile();

    controller = module.get<SlotController>(SlotController);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('getAvailableSlots() calls service and returns grouped slots', async () => {
    const query = { doctorId: 'doc-1' } as any;

    const result = await controller.getAvailableSlots(query);

    expect(mockSlotService.getAvailableSlots).toHaveBeenCalledWith(query);
    expect(result.clinic).toBeDefined();
    expect(result.hospital).toBeDefined();
    expect(result.center).toBeDefined();
  });
});
