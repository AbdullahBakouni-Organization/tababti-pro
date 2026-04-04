import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { SlotGenerationService } from './slot.service';
import { AppointmentSlot } from '@app/common/database/schemas/slot.schema';
import { Doctor } from '@app/common/database/schemas/doctor.schema';
import { CacheService } from '@app/common/cache/cache.service';
import { SlotStatus } from '@app/common/database/schemas/common.enums';
import { createMockModel } from '@app/common/testing';

describe('SlotGenerationService', () => {
  let service: SlotGenerationService;
  let slotModel: ReturnType<typeof createMockModel>;
  let doctorModel: ReturnType<typeof createMockModel>;
  let cacheManager: { get: jest.Mock; set: jest.Mock; invalidate: jest.Mock };

  const doctorId = new Types.ObjectId().toString();

  const mockDoctor = {
    _id: new Types.ObjectId(doctorId),
    firstName: 'Test',
    middleName: 'M',
    lastName: 'Doctor',
    inspectionPrice: 5000,
  };

  const mockSlots = [
    {
      _id: new Types.ObjectId(),
      doctorId: new Types.ObjectId(doctorId),
      date: new Date(Date.now() + 86400000),
      startTime: '09:00',
      endTime: '09:30',
      status: SlotStatus.AVAILABLE,
      location: { type: 'clinic', entity_name: 'Clinic A', address: 'Addr' },
      dayOfWeek: 'MONDAY',
      duration: 30,
      price: 5000,
    },
  ];

  beforeEach(async () => {
    slotModel = createMockModel();
    doctorModel = createMockModel();
    cacheManager = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      invalidate: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SlotGenerationService,
        { provide: getModelToken(AppointmentSlot.name), useValue: slotModel },
        { provide: getModelToken(Doctor.name), useValue: doctorModel },
        { provide: CacheService, useValue: cacheManager },
      ],
    }).compile();

    service = module.get<SlotGenerationService>(SlotGenerationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─── getAvailableSlots ─────────────────────────────────────────────────────

  describe('getAvailableSlots()', () => {
    it('returns grouped available slots for a valid doctor', async () => {
      doctorModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockDoctor),
      });
      slotModel.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(mockSlots),
      });

      const result = await service.getAvailableSlots({ doctorId } as any);

      expect(result.clinic).toBeDefined();
      expect(result.hospital).toBeDefined();
      expect(result.center).toBeDefined();
    });

    it('returns cached result on cache hit', async () => {
      const cached = {
        clinic: { data: [], total: 0 },
        hospital: { data: [], total: 0 },
        center: { data: [], total: 0 },
      };
      cacheManager.get.mockResolvedValue(cached);

      const result = await service.getAvailableSlots({ doctorId } as any);

      expect(result).toBe(cached);
      expect(doctorModel.findById).not.toHaveBeenCalled();
    });

    it('throws BadRequestException for invalid doctorId', async () => {
      await expect(
        service.getAvailableSlots({ doctorId: 'bad-id' } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when doctor not found', async () => {
      doctorModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(
        service.getAvailableSlots({ doctorId } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when startDate > endDate', async () => {
      const yesterday = new Date(Date.now() - 86400000)
        .toISOString()
        .split('T')[0];
      const tomorrow = new Date(Date.now() + 86400000)
        .toISOString()
        .split('T')[0];

      await expect(
        service.getAvailableSlots({
          doctorId,
          startDate: tomorrow,
          endDate: yesterday,
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when requested date is in the past', async () => {
      await expect(
        service.getAvailableSlots({ doctorId, date: '2000-01-01' } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('groups slots by location type', async () => {
      const hospitalSlot = {
        ...mockSlots[0],
        location: {
          type: 'hospital',
          entity_name: 'Hospital B',
          address: 'Addr',
        },
      };
      const centerSlot = {
        ...mockSlots[0],
        location: { type: 'center', entity_name: 'Center C', address: 'Addr' },
      };

      doctorModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockDoctor),
      });
      slotModel.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest
          .fn()
          .mockResolvedValue([mockSlots[0], hospitalSlot, centerSlot]),
      });

      const result = await service.getAvailableSlots({ doctorId } as any);

      expect(result.clinic.data).toHaveLength(1);
      expect(result.hospital.data).toHaveLength(1);
      expect(result.center.data).toHaveLength(1);
    });
  });
});
