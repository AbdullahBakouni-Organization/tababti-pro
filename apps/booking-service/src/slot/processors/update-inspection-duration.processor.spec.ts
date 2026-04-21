import { Test, TestingModule } from '@nestjs/testing';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { getQueueToken } from '@nestjs/bull';
import { Types } from 'mongoose';
import { InspectionDurationUpdateProcessor } from './update-inspection-duration.processor';
import { AppointmentSlot } from '@app/common/database/schemas/slot.schema';
import { Booking } from '@app/common/database/schemas/booking.schema';
import { Doctor } from '@app/common/database/schemas/doctor.schema';
import { KafkaService } from '@app/common/kafka/kafka.service';
import { CacheService } from '@app/common/cache/cache.service';
import { Days, WorkigEntity } from '@app/common/database/schemas/common.enums';

jest.mock('@app/common/utils/cache-invalidation.util', () => ({
  invalidateBookingCaches: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@app/common/utils/get-syria-date', () => ({
  formatDate: jest.fn().mockReturnValue('2025-01-01'),
  formatArabicDate: jest.fn().mockReturnValue('الاثنين 1 يناير 2025'),
  getSyriaDate: jest.fn().mockReturnValue(new Date('2025-01-01T00:00:00Z')),
}));

describe('InspectionDurationUpdateProcessor', () => {
  let processor: InspectionDurationUpdateProcessor;

  const doctorId = new Types.ObjectId().toString();

  const mockSession = {
    startTransaction: jest.fn(),
    commitTransaction: jest.fn().mockResolvedValue(undefined),
    abortTransaction: jest.fn().mockResolvedValue(undefined),
    endSession: jest.fn().mockResolvedValue(undefined),
  };

  const mockConnection = {
    startSession: jest.fn().mockResolvedValue(mockSession),
  };

  const mockSlotModel = {
    find: jest.fn(),
    updateMany: jest.fn().mockResolvedValue({ modifiedCount: 0 }),
    deleteMany: jest.fn().mockResolvedValue({ deletedCount: 0 }),
    insertMany: jest.fn().mockResolvedValue([]),
  };

  const mockBookingModel = {
    findOne: jest.fn(),
    updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
  };

  const mockKafkaService = {
    emit: jest.fn().mockResolvedValue(undefined),
  };

  const mockCacheService = {
    acquireLock: jest.fn().mockResolvedValue('mock-token'),
    releaseLock: jest.fn().mockResolvedValue(undefined),
    invalidate: jest.fn().mockResolvedValue(undefined),
    invalidatePattern: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
  };

  const mockQueue = {
    add: jest.fn().mockResolvedValue(undefined),
  };

  // FIX 6: Doctor model — Phase 2 staleness check.
  const mockDoctorModel = {
    findById: jest.fn(),
  };

  const jobData = {
    doctorId,
    oldInspectionDuration: 30,
    newInspectionDuration: 20,
    inspectionPrice: 5000,
    workingHours: [
      {
        day: Days.MONDAY,
        location: {
          type: WorkigEntity.CLINIC,
          entity_name: 'Clinic A',
          address: 'Damascus',
        },
        startTime: '09:00',
        endTime: '13:00',
      },
    ],
    doctorInfo: { fullName: 'Dr. Ali' },
    version: 2,
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockSession.startTransaction.mockClear();
    mockSession.commitTransaction.mockResolvedValue(undefined);
    mockSession.abortTransaction.mockResolvedValue(undefined);
    mockSession.endSession.mockResolvedValue(undefined);
    mockConnection.startSession.mockResolvedValue(mockSession);
    mockCacheService.acquireLock.mockResolvedValue('mock-token');
    mockCacheService.releaseLock.mockResolvedValue(undefined);
    mockQueue.add.mockResolvedValue(undefined);
    mockDoctorModel.findById.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue({ workingHoursVersion: 0 }),
        }),
      }),
    });

    // Default: both the in-transaction `find().session()` shape and the
    // in-transaction `find().select().session().lean().exec()` shape return
    // empty results.
    mockSlotModel.find.mockImplementation(() => ({
      session: jest.fn().mockResolvedValue([]),
      select: jest.fn().mockReturnValue({
        session: jest.fn().mockReturnValue({
          lean: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue([]),
          }),
        }),
      }),
    }));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InspectionDurationUpdateProcessor,
        {
          provide: getModelToken(AppointmentSlot.name),
          useValue: mockSlotModel,
        },
        { provide: getModelToken(Booking.name), useValue: mockBookingModel },
        { provide: getModelToken(Doctor.name), useValue: mockDoctorModel },
        { provide: getConnectionToken(), useValue: mockConnection },
        { provide: KafkaService, useValue: mockKafkaService },
        { provide: CacheService, useValue: mockCacheService },
        {
          provide: getQueueToken('INSPECTION_DURATION_UPDATE'),
          useValue: mockQueue,
        },
      ],
    }).compile();

    processor = module.get<InspectionDurationUpdateProcessor>(
      InspectionDurationUpdateProcessor,
    );
  });

  it('should be defined', () => {
    expect(processor).toBeDefined();
  });

  describe('process()', () => {
    it('runs normally when lock is acquired and commits the transaction', async () => {
      const mockJob = { data: jobData } as any;
      await expect(processor.process(mockJob)).resolves.not.toThrow();

      expect(mockConnection.startSession).toHaveBeenCalled();
      expect(mockSession.startTransaction).toHaveBeenCalled();
      expect(mockSession.commitTransaction).toHaveBeenCalled();
    });

    it('aborts the transaction when the in-transaction find throws', async () => {
      // Override: first find call throws; selected-lean stays as default.
      mockSlotModel.find.mockImplementationOnce(() => ({
        session: jest.fn().mockRejectedValue(new Error('DB error')),
      }));

      const mockJob = { data: jobData } as any;
      await expect(processor.process(mockJob)).rejects.toThrow('DB error');
      expect(mockSession.abortTransaction).toHaveBeenCalled();
    });
  });

  // ─── Idempotency Lock ─────────────────────────────────────────────────────

  describe('Redis idempotency lock', () => {
    it('acquires the doctor-wide :ALL lock with the documented key + 300s TTL', async () => {
      await processor.process({ data: jobData } as any);

      expect(mockCacheService.acquireLock).toHaveBeenCalledWith(
        `lock:doctor:${doctorId}:ALL`,
        300,
      );
    });

    it('throws so Bull retries when the :ALL lock is held (no transaction starts)', async () => {
      // RC-3 (FIX 3): inspection-duration shares :ALL with day-ops. Contention
      // could mean a day-op is running — dropping the inspection edit would
      // lose the doctor's change, so we throw to let Bull retry.
      mockCacheService.acquireLock.mockResolvedValue(false);
      const warnSpy = jest
        .spyOn((processor as any).logger, 'warn')
        .mockImplementation(() => {});

      await expect(
        processor.process({ data: jobData } as any),
      ).rejects.toThrow(/Cross-op lock .* held/);

      expect(mockConnection.startSession).not.toHaveBeenCalled();
      expect(mockSlotModel.find).not.toHaveBeenCalled();
      expect(mockSlotModel.deleteMany).not.toHaveBeenCalled();
      expect(mockSlotModel.insertMany).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Contended'));
      warnSpy.mockRestore();
    });

    it('throws on :ALL contention and never enters the transaction', async () => {
      // RC-3 (FIX 3): retry semantics for cross-op coordination.
      mockCacheService.acquireLock.mockResolvedValue(false);

      await expect(
        processor.process({ data: jobData } as any),
      ).rejects.toThrow(/Bull will retry/);

      expect(mockConnection.startSession).not.toHaveBeenCalled();
    });

    it('throws so Bull retries when Redis is unavailable (acquireLock returns null)', async () => {
      mockCacheService.acquireLock.mockResolvedValueOnce(null);

      await expect(
        processor.process({ data: jobData } as any),
      ).rejects.toThrow(/Redis unavailable/);

      expect(mockConnection.startSession).not.toHaveBeenCalled();
      expect(mockCacheService.releaseLock).not.toHaveBeenCalled();
    });

    it('releases the :ALL lock after a successful run', async () => {
      await processor.process({ data: jobData } as any);

      expect(mockCacheService.releaseLock).toHaveBeenCalledWith(
        `lock:doctor:${doctorId}:ALL`,
        'mock-token',
      );
    });

    it('releases the :ALL lock even when the transaction aborts', async () => {
      mockSlotModel.find.mockImplementationOnce(() => ({
        session: jest.fn().mockRejectedValue(new Error('DB down')),
      }));

      await expect(processor.process({ data: jobData } as any)).rejects.toThrow(
        'DB down',
      );

      expect(mockCacheService.releaseLock).toHaveBeenCalledWith(
        `lock:doctor:${doctorId}:ALL`,
        'mock-token',
      );
    });
  });

  // ─── Phase 1 / Phase 2 split ────────────────────────────────────────────
  describe('Phase 1 / Phase 2 split', () => {
    it('dispatches Phase 2 via selfQueue.add after a successful Phase 1', async () => {
      await processor.process({ data: jobData } as any);

      expect(mockQueue.add).toHaveBeenCalledWith(
        'PROCESS_INSPECTION_DURATION_UPDATE_PHASE2',
        jobData,
      );
    });

    it('does not dispatch Phase 2 when Phase 1 throws', async () => {
      mockSlotModel.find.mockImplementationOnce(() => ({
        session: jest.fn().mockRejectedValue(new Error('DB down')),
      }));

      await expect(processor.process({ data: jobData } as any)).rejects.toThrow(
        'DB down',
      );

      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('does not throw when Phase 2 dispatch fails (Phase 1 stands)', async () => {
      mockQueue.add.mockRejectedValueOnce(new Error('Bull down'));
      const errorSpy = jest
        .spyOn((processor as any).logger, 'error')
        .mockImplementation(() => {});

      await expect(
        processor.process({ data: jobData } as any),
      ).resolves.toBeUndefined();

      await new Promise((resolve) => setImmediate(resolve));

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to dispatch Phase 2'),
        expect.anything(),
      );
      errorSpy.mockRestore();
    });

    it('Phase 2 handler acquires the :ALL :backfill lock', async () => {
      await processor.processPhase2({ data: jobData } as any);

      expect(mockCacheService.acquireLock).toHaveBeenCalledWith(
        `lock:doctor:${doctorId}:ALL:backfill`,
        300,
      );
    });

    it('Phase 2 handler releases the :ALL :backfill lock after completion', async () => {
      await processor.processPhase2({ data: jobData } as any);

      expect(mockCacheService.releaseLock).toHaveBeenCalledWith(
        `lock:doctor:${doctorId}:ALL:backfill`,
        'mock-token',
      );
    });

    it('Phase 2 handler does not chain another Phase 2', async () => {
      await processor.processPhase2({ data: jobData } as any);

      expect(mockQueue.add).not.toHaveBeenCalled();
    });
  });

  // ─── RC-6 (FIX 6): Phase 2 staleness check ─────────────────────────────
  describe('RC-6 Phase 2 staleness check', () => {
    it('proceeds with Phase 2 when doctor.workingHoursVersion equals job.version', async () => {
      // jobData.version = 2; doctor.workingHoursVersion = 2 → not stale.
      mockDoctorModel.findById.mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue({ workingHoursVersion: 2 }),
          }),
        }),
      });

      await processor.processPhase2({ data: jobData } as any);

      // Lock was acquired → Phase 2 ran.
      expect(mockCacheService.acquireLock).toHaveBeenCalledWith(
        `lock:doctor:${doctorId}:ALL:backfill`,
        300,
      );
      expect(mockConnection.startSession).toHaveBeenCalled();
    });

    it('skips Phase 2 when doctor.workingHoursVersion has advanced past job.version', async () => {
      // jobData.version = 2; doctor.workingHoursVersion = 5 → stale.
      mockDoctorModel.findById.mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue({ workingHoursVersion: 5 }),
          }),
        }),
      });
      const warnSpy = jest
        .spyOn((processor as any).logger, 'warn')
        .mockImplementation(() => {});

      await processor.processPhase2({ data: jobData } as any);

      // Stale → skipped: no lock, no session, no work.
      expect(mockCacheService.acquireLock).not.toHaveBeenCalled();
      expect(mockConnection.startSession).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Phase 2 stale'),
      );
      warnSpy.mockRestore();
    });

    it('skips Phase 2 cleanly when the doctor record is gone', async () => {
      mockDoctorModel.findById.mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue(null),
          }),
        }),
      });

      await processor.processPhase2({ data: jobData } as any);

      expect(mockCacheService.acquireLock).not.toHaveBeenCalled();
      expect(mockConnection.startSession).not.toHaveBeenCalled();
    });

    it('selects only workingHoursVersion (no full doc fetch)', async () => {
      const selectSpy = jest.fn().mockReturnValue({
        lean: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue({ workingHoursVersion: 0 }),
        }),
      });
      mockDoctorModel.findById.mockReturnValue({ select: selectSpy });

      await processor.processPhase2({ data: jobData } as any);

      expect(selectSpy).toHaveBeenCalledWith('workingHoursVersion');
    });

    it('Phase 1 handler is NOT staleness-checked (always runs)', async () => {
      // Even with a clearly-stale doctor version, Phase 1 must still run —
      // staleness only applies to deferred Phase 2 jobs.
      mockDoctorModel.findById.mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue({ workingHoursVersion: 999 }),
          }),
        }),
      });

      await processor.process({ data: jobData } as any);

      expect(mockCacheService.acquireLock).toHaveBeenCalledWith(
        `lock:doctor:${doctorId}:ALL`,
        300,
      );
      expect(mockConnection.startSession).toHaveBeenCalled();
    });
  });

  // ─── FIX 4 / RC-8: booking status guard ────────────────────────────────
  describe('RC-8 booking status guard', () => {
    const bookedSlotId = new Types.ObjectId();
    const bookingId = new Types.ObjectId();

    const mockBookedSlot = {
      _id: bookedSlotId,
      status: 'booked',
      doctorId: new Types.ObjectId(doctorId),
    };

    beforeEach(() => {
      // First find() call returns the booked slot; subsequent find() calls
      // (keptInvalidated lookup, in-tx) return empty via the
      // select.session.lean.exec chain.
      let callCount = 0;
      mockSlotModel.find.mockImplementation(() => {
        callCount += 1;
        if (callCount === 1) {
          return {
            session: jest.fn().mockResolvedValue([mockBookedSlot]),
          };
        }
        return {
          session: jest.fn().mockResolvedValue([]),
          select: jest.fn().mockReturnValue({
            session: jest.fn().mockReturnValue({
              lean: jest.fn().mockReturnValue({
                exec: jest.fn().mockResolvedValue([]),
              }),
            }),
          }),
        };
      });

      mockBookingModel.findOne.mockReturnValue({
        populate: jest.fn().mockReturnValue({
          populate: jest.fn().mockReturnValue({
            session: jest.fn().mockReturnValue({
              exec: jest.fn().mockResolvedValue({
                _id: bookingId,
                patientId: { _id: new Types.ObjectId(), fcmToken: 'tok-x' },
                doctorId: {
                  _id: new Types.ObjectId(doctorId),
                  firstName: 'Dr',
                  lastName: 'Who',
                },
                bookingDate: new Date('2025-06-01'),
                bookingTime: '10:00',
              }),
            }),
          }),
        }),
      });
    });

    it('uses status filter [PENDING, CONFIRMED, RESCHEDULED] when cancelling a booked slot', async () => {
      await processor.process({ data: jobData } as any);

      expect(mockBookingModel.updateOne).toHaveBeenCalledWith(
        {
          _id: bookingId,
          status: {
            $in: ['pending', 'confirmed', 'rescheduled'],
          },
        },
        expect.objectContaining({
          $set: expect.objectContaining({
            status: 'cancelled_by_doctor',
            cancellation: expect.objectContaining({ cancelledBy: 'DOCTOR' }),
          }),
        }),
        { session: mockSession },
      );
    });

    it('logs and skips push to affectedBookings when the booking already finalized', async () => {
      mockBookingModel.updateOne.mockResolvedValueOnce({ modifiedCount: 0 });

      const infoSpy = jest
        .spyOn((processor as any).logger, 'log')
        .mockImplementation(() => {});

      await processor.process({ data: jobData } as any);

      expect(infoSpy).toHaveBeenCalledWith(
        expect.stringContaining('already finalized'),
      );

      // Slot still goes into invalidatedSlotIds (we keep its audit row even
      // when we did not cancel the booking).
      expect(mockSlotModel.updateMany).toHaveBeenCalledWith(
        { _id: { $in: [bookedSlotId] } },
        { $set: { status: 'invalidated' } },
        { session: mockSession },
      );

      infoSpy.mockRestore();
    });

    // ─── FIX 2 / RC-5: rebuild slots inside the transaction ──────────────
    describe('RC-5 atomic wipe-and-rebuild', () => {
      it('calls insertMany WITH session before commitTransaction', async () => {
        // Single booked slot drives the bookedSlots → updateMany → deleteMany
        // path; subsequent select.session.lean.exec returns empty (no kept
        // invalidated rows blocking the new inserts).
        const callOrder: string[] = [];
        mockSession.commitTransaction.mockImplementationOnce(async () => {
          callOrder.push('commit');
        });
        mockSlotModel.insertMany.mockImplementation(async (_batch, opts) => {
          callOrder.push(`insert(session=${opts?.session ? 'yes' : 'no'})`);
          return [];
        });

        await processor.process({ data: jobData } as any);

        // Insert ran BEFORE commit and was passed the session.
        expect(callOrder[0]).toBe('insert(session=yes)');
        expect(callOrder[callOrder.length - 1]).toBe('commit');
      });

      it('does not call insertMany if the transaction aborts mid-flow', async () => {
        // Force the deleteMany inside the transaction to throw, simulating a
        // crash between wipe and rebuild — rebuild must NOT proceed.
        mockSlotModel.deleteMany.mockRejectedValueOnce(new Error('crash'));

        await expect(processor.process({ data: jobData } as any)).rejects.toThrow(
          'crash',
        );

        expect(mockSlotModel.insertMany).not.toHaveBeenCalled();
        expect(mockSession.abortTransaction).toHaveBeenCalled();
        expect(mockSession.commitTransaction).not.toHaveBeenCalled();
      });

      it('keptInvalidated lookup runs INSIDE the transaction (carries the session)', async () => {
        const sessionSpy = jest.fn().mockReturnValue({
          lean: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue([]),
          }),
        });

        let callCount = 0;
        mockSlotModel.find.mockImplementation(() => {
          callCount += 1;
          if (callCount === 1) {
            // bookedSlots in-tx find — uses .session() shape directly.
            return { session: jest.fn().mockResolvedValue([]) };
          }
          // keptInvalidated lookup — must use session-bearing chain.
          return {
            session: jest.fn().mockResolvedValue([]),
            select: jest.fn().mockReturnValue({
              session: sessionSpy,
            }),
          };
        });

        await processor.process({ data: jobData } as any);

        expect(sessionSpy).toHaveBeenCalledWith(mockSession);
      });
    });

    it('keeps the slot in invalidatedSlotIds even when no booking is found', async () => {
      mockBookingModel.findOne.mockReturnValue({
        populate: jest.fn().mockReturnValue({
          populate: jest.fn().mockReturnValue({
            session: jest.fn().mockReturnValue({
              exec: jest.fn().mockResolvedValue(null),
            }),
          }),
        }),
      });

      await processor.process({ data: jobData } as any);

      expect(mockSlotModel.updateMany).toHaveBeenCalledWith(
        { _id: { $in: [bookedSlotId] } },
        { $set: { status: 'invalidated' } },
        { session: mockSession },
      );
      expect(mockBookingModel.updateOne).not.toHaveBeenCalled();
    });
  });
});
