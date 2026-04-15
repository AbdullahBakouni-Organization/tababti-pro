import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bull';
import { SlotKafkaController } from './slot-kafka.controller';
import { SlotGenerationService } from './slot.service';

describe('SlotKafkaController', () => {
  let controller: SlotKafkaController;

  const mockSlotGenerationService = {
    getAvailableSlots: jest.fn().mockResolvedValue([]),
  };

  const mockWorkingHoursQueue = {
    add: jest.fn().mockResolvedValue({ id: 'job-1' }),
  };

  const mockWorkingHoursQueueV1 = {
    add: jest.fn().mockResolvedValue({ id: 'job-2' }),
  };

  const mockWorkingHoursDeleteQueue = {
    add: jest.fn().mockResolvedValue({ id: 'job-3' }),
  };

  const mockInspectionDurationQueue = {
    add: jest.fn().mockResolvedValue({ id: 'job-4' }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SlotKafkaController],
      providers: [
        { provide: SlotGenerationService, useValue: mockSlotGenerationService },
        {
          provide: getQueueToken('WORKING_HOURS_UPDATE'),
          useValue: mockWorkingHoursQueue,
        },
        {
          provide: getQueueToken('WORKING_HOURS_GENERATE'),
          useValue: mockWorkingHoursQueueV1,
        },
        {
          provide: getQueueToken('WORKING_HOURS_DELETE'),
          useValue: mockWorkingHoursDeleteQueue,
        },
        {
          provide: getQueueToken('INSPECTION_DURATION_UPDATE'),
          useValue: mockInspectionDurationQueue,
        },
      ],
    }).compile();

    controller = module.get<SlotKafkaController>(SlotKafkaController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('handleSlotsRefreshed()', () => {
    it('calls getAvailableSlots with doctorId', async () => {
      const event = { data: { doctorId: 'doc-1', location: 'clinic' } };
      await controller.handleSlotsRefreshed(event as any);
      expect(mockSlotGenerationService.getAvailableSlots).toHaveBeenCalledWith({
        doctorId: 'doc-1',
      });
    });

    it('does not throw when getAvailableSlots fails', async () => {
      mockSlotGenerationService.getAvailableSlots.mockRejectedValue(
        new Error('Service down'),
      );
      const event = { data: { doctorId: 'doc-1', location: 'clinic' } };
      await expect(
        controller.handleSlotsRefreshed(event as any),
      ).resolves.toBeUndefined();
    });
  });

  describe('handleWorkingHoursUpdated()', () => {
    it('adds job to WORKING_HOURS_UPDATE queue', async () => {
      const event = {
        doctorId: 'doc-1',
        oldWorkingHours: [],
        newWorkingHours: [],
        updatedDays: ['MONDAY'],
        version: 1,
        inspectionDuration: 30,
        inspectionPrice: 5000,
      };
      await controller.handleWorkingHoursUpdated(event as any);
      expect(mockWorkingHoursQueue.add).toHaveBeenCalledWith(
        'PROCESS_WORKING_HOURS_UPDATE',
        expect.objectContaining({ doctorId: 'doc-1' }),
      );
    });
  });
});
