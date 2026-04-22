import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { WorkingHoursService } from './working-hours.service';
import { Doctor } from '@app/common/database/schemas/doctor.schema';
import { Booking } from '@app/common/database/schemas/booking.schema';
import { KafkaService } from '@app/common/kafka/kafka.service';
import { CacheService } from '@app/common/cache/cache.service';
import { ConflictDetectionService } from './conflict-detection.service';
import { createMockModel } from '@app/common/testing';

jest.mock('@app/common/utils/cache-invalidation.util', () => ({
  invalidateBookingCaches: jest.fn().mockResolvedValue(undefined),
}));

// Mock working-hours validator that would throw on invalid input
jest.mock('./working-hours.validator', () => ({
  WorkingHoursValidator: {
    validateUpdate: jest.fn(),
  },
}));

describe('WorkingHoursService', () => {
  let service: WorkingHoursService;
  let doctorModel: ReturnType<typeof createMockModel>;
  let kafkaService: { emit: jest.Mock };
  let cacheManager: {
    get: jest.Mock;
    set: jest.Mock;
    invalidate: jest.Mock;
    invalidatePattern: jest.Mock;
  };
  let conflictDetectionService: {
    detectConflicts: jest.Mock;
    getUniquePatientCount: jest.Mock;
  };

  const doctorId = new Types.ObjectId().toString();

  const mockWorkingHours = [
    {
      day: 'MONDAY',
      startTime: '09:00',
      endTime: '17:00',
      isActive: true,
      location: { type: 'clinic', entity_name: 'Clinic A', address: 'Addr' },
    },
  ];

  const mockDoctor = {
    _id: new Types.ObjectId(doctorId),
    firstName: 'Test',
    lastName: 'Doctor',
    workingHours: [],
    inspectionDuration: 30,
    inspectionPrice: 5000,
    save: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    doctorModel = createMockModel();
    kafkaService = { emit: jest.fn() };
    cacheManager = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      invalidate: jest.fn(),
      invalidatePattern: jest.fn(),
    };
    conflictDetectionService = {
      detectConflicts: jest
        .fn()
        .mockResolvedValue({ todayConflicts: [], futureConflicts: [] }),
      getUniquePatientCount: jest.fn().mockReturnValue(0),
    };

    mockDoctor.save.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkingHoursService,
        { provide: getModelToken(Doctor.name), useValue: doctorModel },
        { provide: getModelToken(Booking.name), useValue: createMockModel() },
        { provide: KafkaService, useValue: kafkaService },
        { provide: CacheService, useValue: cacheManager },
        {
          provide: ConflictDetectionService,
          useValue: conflictDetectionService,
        },
      ],
    }).compile();

    service = module.get<WorkingHoursService>(WorkingHoursService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─── addWorkingHours ───────────────────────────────────────────────────────

  describe('addWorkingHours()', () => {
    it('adds working hours and returns success response', async () => {
      // Doctor starts with no working hours so checkIfSameAsExisting passes
      const freshDoctor = {
        ...mockDoctor,
        workingHours: [],
        save: jest.fn().mockResolvedValue(undefined),
      };
      doctorModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(freshDoctor),
      });

      const result = await service.addWorkingHours(doctorId, {
        workingHours: mockWorkingHours,
        inspectionDuration: 30,
        inspectionPrice: 5000,
      } as any);

      expect(result.doctorId).toBe(doctorId);
      expect(freshDoctor.save).toHaveBeenCalled();
    });

    it('throws BadRequestException for invalid doctorId', async () => {
      await expect(
        service.addWorkingHours('bad-id', { workingHours: [] } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when doctor not found', async () => {
      doctorModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(
        service.addWorkingHours(doctorId, {
          workingHours: mockWorkingHours,
        } as any),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── checkWorkingHoursConflicts ────────────────────────────────────────────

  describe('checkWorkingHoursConflicts()', () => {
    it('returns no conflicts when none detected', async () => {
      doctorModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ ...mockDoctor, workingHours: [] }),
      });

      const result = await service.checkWorkingHoursConflicts(doctorId, {
        workingHours: mockWorkingHours,
      } as any);

      expect(result.hasConflicts).toBe(false);
      expect(result.summary.totalConflicts).toBe(0);
    });

    it('returns conflicts when booking conflicts exist', async () => {
      doctorModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ ...mockDoctor, workingHours: [] }),
      });
      conflictDetectionService.detectConflicts.mockResolvedValue({
        todayConflicts: [{ bookingId: 'b1' }],
        futureConflicts: [{ bookingId: 'b2' }],
      });
      conflictDetectionService.getUniquePatientCount.mockReturnValue(2);

      const result = await service.checkWorkingHoursConflicts(doctorId, {
        workingHours: mockWorkingHours,
      } as any);

      expect(result.hasConflicts).toBe(true);
      expect(result.summary.totalConflicts).toBe(2);
    });

    it('throws BadRequestException for invalid doctorId', async () => {
      await expect(
        service.checkWorkingHoursConflicts('bad-id', {
          workingHours: [],
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when doctor not found', async () => {
      doctorModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(
        service.checkWorkingHoursConflicts(doctorId, {
          workingHours: [],
        } as any),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── getWorkingHours ───────────────────────────────────────────────────────

  describe('getWorkingHours()', () => {
    it('returns working hours from database', async () => {
      doctorModel.findById.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue({
          workingHours: mockWorkingHours,
          inspectionDuration: 30,
          inspectionPrice: 5000,
        }),
      });

      const result = await service.getWorkingHours(doctorId);

      expect(result.workingHours).toEqual(mockWorkingHours);
      expect(result.doctorId).toBe(doctorId);
    });

    it('returns cached result on cache hit', async () => {
      const cached = { doctorId, workingHours: mockWorkingHours };
      cacheManager.get.mockResolvedValue(cached);

      const result = await service.getWorkingHours(doctorId);

      expect(result).toBe(cached);
      expect(doctorModel.findById).not.toHaveBeenCalled();
    });

    it('throws BadRequestException for invalid doctorId', async () => {
      await expect(service.getWorkingHours('bad-id')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws NotFoundException when doctor not found', async () => {
      doctorModel.findById.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(service.getWorkingHours(doctorId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── getPhase2ProcessingStatus ────────────────────────────────────────────

  describe('getPhase2ProcessingStatus()', () => {
    it('returns phase2Running=false shape when no key is cached', async () => {
      cacheManager.get.mockResolvedValueOnce(null);

      const result = await service.getPhase2ProcessingStatus(doctorId);

      expect(cacheManager.get).toHaveBeenCalledWith(
        `phase2:running:${doctorId}`,
      );
      expect(result).toEqual({
        phase2Running: false,
        operation: null,
        startedAt: null,
      });
    });

    it('parses the cached JSON payload and reports phase2Running=true', async () => {
      const startedAt = '2026-04-22T06:11:52.000Z';
      cacheManager.get.mockResolvedValueOnce(
        JSON.stringify({ operation: 'update', startedAt }),
      );

      const result = await service.getPhase2ProcessingStatus(doctorId);

      expect(result).toEqual({
        phase2Running: true,
        operation: 'update',
        startedAt,
      });
    });

    it('handles every processor operation label (create/update/delete/inspection)', async () => {
      const ops: Array<'create' | 'update' | 'delete' | 'inspection'> = [
        'create',
        'update',
        'delete',
        'inspection',
      ];

      for (const op of ops) {
        cacheManager.get.mockResolvedValueOnce(
          JSON.stringify({
            operation: op,
            startedAt: '2026-04-22T06:11:52.000Z',
          }),
        );

        const result = await service.getPhase2ProcessingStatus(doctorId);
        expect(result.phase2Running).toBe(true);
        expect(result.operation).toBe(op);
      }
    });
  });

  // ─── Phase 2 in-flight guard (applies to all 4 mutating entry points) ─────

  describe('assertNoPhase2InFlight guard', () => {
    const phase2Payload = JSON.stringify({
      operation: 'update',
      startedAt: '2026-04-22T06:11:52.000Z',
    });

    it('addWorkingHours() throws 409 when phase2:running key is set', async () => {
      cacheManager.get.mockResolvedValueOnce(phase2Payload);

      await expect(
        service.addWorkingHours(doctorId, {
          workingHours: mockWorkingHours,
          inspectionDuration: 30,
          inspectionPrice: 5000,
        } as any),
      ).rejects.toThrow(ConflictException);

      // Guard must reject before touching the DB — otherwise the backend
      // pays for validation work on a request it was going to reject.
      expect(doctorModel.findById).not.toHaveBeenCalled();
    });

    it('updateWorkingHours() throws 409 when phase2:running key is set', async () => {
      cacheManager.get.mockResolvedValueOnce(phase2Payload);

      await expect(
        service.updateWorkingHours(doctorId, {
          workingHours: mockWorkingHours,
        } as any),
      ).rejects.toThrow(ConflictException);

      expect(doctorModel.findById).not.toHaveBeenCalled();
    });

    it('deleteWorkingHours() throws 409 when phase2:running key is set', async () => {
      cacheManager.get.mockResolvedValueOnce(phase2Payload);

      await expect(
        service.deleteWorkingHours(doctorId, {
          confirm: true,
          day: 'MONDAY',
          startTime: '09:00',
          endTime: '17:00',
          location: {
            type: 'clinic',
            entity_name: 'Clinic A',
            address: 'Addr',
          },
        } as any),
      ).rejects.toThrow(ConflictException);

      expect(doctorModel.findById).not.toHaveBeenCalled();
    });

    it('updateInspectionDuration() throws 409 when phase2:running key is set', async () => {
      cacheManager.get.mockResolvedValueOnce(phase2Payload);

      await expect(
        service.updateInspectionDuration(doctorId, {
          confirm: true,
          inspectionDuration: 30,
        } as any),
      ).rejects.toThrow(ConflictException);

      expect(doctorModel.findById).not.toHaveBeenCalled();
    });

    it('fails open when Redis throws — never blocks the doctor on infra flake', async () => {
      cacheManager.get.mockRejectedValueOnce(new Error('ECONNREFUSED'));
      // Doctor exists so the rest of the flow can proceed cleanly.
      const freshDoctor = {
        ...mockDoctor,
        workingHours: [],
        save: jest.fn().mockResolvedValue(undefined),
      };
      doctorModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(freshDoctor),
      });

      await expect(
        service.addWorkingHours(doctorId, {
          workingHours: mockWorkingHours,
          inspectionDuration: 30,
          inspectionPrice: 5000,
        } as any),
      ).resolves.toBeDefined();
    });

    it('fails open on malformed phase2:running payload — never blocks the doctor', async () => {
      cacheManager.get.mockResolvedValueOnce('not-json-at-all');
      const freshDoctor = {
        ...mockDoctor,
        workingHours: [],
        save: jest.fn().mockResolvedValue(undefined),
      };
      doctorModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(freshDoctor),
      });

      await expect(
        service.addWorkingHours(doctorId, {
          workingHours: mockWorkingHours,
          inspectionDuration: 30,
          inspectionPrice: 5000,
        } as any),
      ).resolves.toBeDefined();
    });
  });
});
