import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { SlotGenerationProcessor } from './generate-working-hours.processor';
import { AppointmentSlot } from '@app/common/database/schemas/slot.schema';
import { Days, WorkigEntity } from '@app/common/database/schemas/common.enums';

describe('SlotGenerationProcessor', () => {
  let processor: SlotGenerationProcessor;

  const mockSlotModel = {
    find: jest.fn(),
    insertMany: jest.fn(),
    deleteMany: jest.fn(),
    create: jest.fn(),
    bulkWrite: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SlotGenerationProcessor,
        { provide: getModelToken(AppointmentSlot.name), useValue: mockSlotModel },
      ],
    }).compile();

    processor = module.get<SlotGenerationProcessor>(SlotGenerationProcessor);
  });

  it('should be defined', () => {
    expect(processor).toBeDefined();
  });

  describe('handleSlotGeneration()', () => {
    const doctorId = new Types.ObjectId().toString();

    const mockJob = {
      id: 'job-1',
      data: {
        eventType: 'SLOTS_GENERATE' as const,
        timestamp: new Date().toISOString(),
        doctorId,
        WorkingHours: [
          {
            day: Days.MONDAY,
            location: {
              type: WorkigEntity.CLINIC,
              entity_name: 'Clinic A',
              address: 'Addr 1',
            },
            startTime: '09:00',
            endTime: '17:00',
          },
        ],
        inspectionDuration: 30,
        inspectionPrice: 5000,
        doctorInfo: { fullName: 'Dr. Ali' },
      },
      progress: jest.fn().mockResolvedValue(undefined),
      log: jest.fn(),
    };

    it('processes job without throwing', async () => {
      mockSlotModel.find.mockReturnValue({ lean: jest.fn().mockResolvedValue([]) });
      mockSlotModel.insertMany.mockResolvedValue([]);

      await expect(processor.handleSlotGeneration(mockJob as any)).resolves.toBeUndefined();
    });

    it('calls job.progress during processing', async () => {
      mockSlotModel.find.mockReturnValue({ lean: jest.fn().mockResolvedValue([]) });
      mockSlotModel.insertMany.mockResolvedValue([]);

      await processor.handleSlotGeneration(mockJob as any);
      expect(mockJob.progress).toHaveBeenCalled();
    });
  });
});
