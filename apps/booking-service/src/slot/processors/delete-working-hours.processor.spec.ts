import { Test, TestingModule } from '@nestjs/testing';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { getQueueToken } from '@nestjs/bull';
import { Types } from 'mongoose';
import { WorkingHoursDeleteProcessor } from './delete-working-hours.processor';
import { AppointmentSlot } from '@app/common/database/schemas/slot.schema';
import { Booking } from '@app/common/database/schemas/booking.schema';
import { Doctor } from '@app/common/database/schemas/doctor.schema';
import { KafkaService } from '@app/common/kafka/kafka.service';
import { CacheService } from '@app/common/cache/cache.service';
import {
  Days,
  SlotStatus,
  WorkigEntity,
} from '@app/common/database/schemas/common.enums';

jest.mock('@app/common/utils/cache-invalidation.util', () => ({
  invalidateBookingCaches: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@app/common/utils/get-syria-date', () => ({
  formatDate: jest.fn().mockReturnValue('2025-01-01'),
  formatArabicDate: jest.fn().mockReturnValue('الاثنين 1 يناير 2025'),
}));

describe('WorkingHoursDeleteProcessor', () => {
  let processor: WorkingHoursDeleteProcessor;

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
    findOne: jest.fn(),
    findById: jest.fn(),
    updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
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

  // FIX 6: Doctor model — Phase 2 staleness check uses workingHoursVersion.
  // Default returns version 0 so any positive job.version is fresh.
  const mockDoctorModel = {
    findById: jest.fn(),
  };

  const jobData = {
    doctorId,
    deletedWorkingHour: {
      day: Days.MONDAY,
      location: {
        type: WorkigEntity.CLINIC,
        entity_name: 'Clinic A',
        address: 'Damascus',
      },
      startTime: '08:00',
      endTime: '12:00',
    },
    version: 1,
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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkingHoursDeleteProcessor,
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
          provide: getQueueToken('WORKING_HOURS_DELETE'),
          useValue: mockQueue,
        },
      ],
    }).compile();

    processor = module.get<WorkingHoursDeleteProcessor>(
      WorkingHoursDeleteProcessor,
    );
  });

  it('should be defined', () => {
    expect(processor).toBeDefined();
  });

  // ─── Main flow ────────────────────────────────────────────────────────────

  describe('processWorkingHoursDelete()', () => {
    it('processes empty result without throwing and commits the transaction', async () => {
      mockSlotModel.find.mockReturnValue({
        session: jest.fn().mockResolvedValue([]),
      });

      const mockJob = { data: jobData } as any;
      await expect(
        processor.processWorkingHoursDelete(mockJob),
      ).resolves.not.toThrow();

      expect(mockConnection.startSession).toHaveBeenCalled();
      expect(mockSession.startTransaction).toHaveBeenCalled();
      expect(mockSession.commitTransaction).toHaveBeenCalled();
    });

    it('invalidates slots whose time window falls inside the deleted entry', async () => {
      // 08:00–08:30 is inside 08:00–12:00, should be invalidated
      const slotInRange = {
        _id: new Types.ObjectId(),
        status: SlotStatus.AVAILABLE,
        version: 1,
        startTime: '08:00',
        endTime: '08:30',
        location: jobData.deletedWorkingHour.location,
      };

      // 07:30–08:00 is outside 08:00–12:00, must be skipped
      const slotOutOfRange = {
        _id: new Types.ObjectId(),
        status: SlotStatus.AVAILABLE,
        version: 1,
        startTime: '07:30',
        endTime: '08:00',
        location: jobData.deletedWorkingHour.location,
      };

      mockSlotModel.find.mockReturnValue({
        session: jest.fn().mockResolvedValue([slotInRange, slotOutOfRange]),
      });

      const mockJob = { data: jobData } as any;
      await processor.processWorkingHoursDelete(mockJob);

      // RC-3 guard: status filter on _id+status, not unconditional save
      expect(mockSlotModel.updateOne).toHaveBeenCalledWith(
        { _id: slotInRange._id, status: SlotStatus.AVAILABLE },
        {
          $set: { status: SlotStatus.INVALIDATED },
          $inc: { version: 1 },
        },
        { session: mockSession },
      );
      // Out-of-range slot must not be invalidated
      expect(mockSlotModel.updateOne).not.toHaveBeenCalledWith(
        expect.objectContaining({ _id: slotOutOfRange._id }),
        expect.anything(),
        expect.anything(),
      );
    });

    it('uses a SINGLE bulk find covering the 48-week window (no per-date loop)', async () => {
      mockSlotModel.find.mockReturnValue({
        session: jest.fn().mockResolvedValue([]),
      });

      const mockJob = { data: jobData } as any;
      await processor.processWorkingHoursDelete(mockJob);

      // Exactly one find() call on the slot model — proves the per-date loop
      // is gone. The filter must include both dayOfWeek and a date range.
      expect(mockSlotModel.find).toHaveBeenCalledTimes(1);
      const filter = mockSlotModel.find.mock.calls[0][0];
      expect(filter.dayOfWeek).toBe(Days.MONDAY);
      expect(filter.date.$gte).toBeInstanceOf(Date);
      expect(filter.date.$lte).toBeInstanceOf(Date);
    });

    // ─── FIX 1 / RC-3: status guard with re-fetch on race ─────────────────
    describe('RC-3 status-guarded invalidate', () => {
      it('re-fetches and cancels the booking if the slot raced from AVAILABLE to BOOKED', async () => {
        const racedSlot = {
          _id: new Types.ObjectId(),
          status: SlotStatus.AVAILABLE,
          version: 3,
          startTime: '08:00',
          endTime: '08:30',
          location: jobData.deletedWorkingHour.location,
        };

        mockSlotModel.find.mockReturnValue({
          session: jest.fn().mockResolvedValue([racedSlot]),
        });

        // First updateOne (guarded by status: AVAILABLE) — no rows matched
        // because a patient just booked the slot.
        mockSlotModel.updateOne
          .mockResolvedValueOnce({ modifiedCount: 0 })
          .mockResolvedValueOnce({ modifiedCount: 1 });

        // Re-fetch returns the now-BOOKED slot.
        const freshBooked = {
          _id: racedSlot._id,
          status: SlotStatus.BOOKED,
          version: 4,
        };
        mockSlotModel.findById.mockReturnValue({
          session: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue(freshBooked),
          }),
        });

        // Booking lookup for the racing booking.
        const bookingId = new Types.ObjectId();
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
                  bookingTime: '08:00',
                }),
              }),
            }),
          }),
        });

        const warnSpy = jest
          .spyOn((processor as any).logger, 'warn')
          .mockImplementation(() => {});

        await processor.processWorkingHoursDelete({ data: jobData } as any);

        // First guarded write attempted with status: AVAILABLE
        expect(mockSlotModel.updateOne).toHaveBeenNthCalledWith(
          1,
          { _id: racedSlot._id, status: SlotStatus.AVAILABLE },
          expect.any(Object),
          { session: mockSession },
        );

        // Re-fetch happened in the same session
        expect(mockSlotModel.findById).toHaveBeenCalledWith(racedSlot._id);

        // Booking was cancelled with CANCELLED_BY_DOCTOR after re-fetch,
        // guarded by RC-8 status filter.
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

        // Second guarded write succeeded with status: BOOKED
        expect(mockSlotModel.updateOne).toHaveBeenNthCalledWith(
          2,
          { _id: racedSlot._id, status: SlotStatus.BOOKED },
          expect.any(Object),
          { session: mockSession },
        );

        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining('BOOKED between read and write'),
        );
        warnSpy.mockRestore();
      });

      it('skips the slot without retry if the re-fetch shows it is already INVALIDATED', async () => {
        const racedSlot = {
          _id: new Types.ObjectId(),
          status: SlotStatus.AVAILABLE,
          version: 1,
          startTime: '08:00',
          endTime: '08:30',
          location: jobData.deletedWorkingHour.location,
        };

        mockSlotModel.find.mockReturnValue({
          session: jest.fn().mockResolvedValue([racedSlot]),
        });
        mockSlotModel.updateOne.mockResolvedValueOnce({ modifiedCount: 0 });
        mockSlotModel.findById.mockReturnValue({
          session: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue({
              _id: racedSlot._id,
              status: SlotStatus.INVALIDATED,
              version: 2,
            }),
          }),
        });

        const warnSpy = jest
          .spyOn((processor as any).logger, 'warn')
          .mockImplementation(() => {});

        await processor.processWorkingHoursDelete({ data: jobData } as any);

        // Only the initial guarded write — no retry, no booking lookup.
        expect(mockSlotModel.updateOne).toHaveBeenCalledTimes(1);
        expect(mockBookingModel.findOne).not.toHaveBeenCalled();
        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining('already INVALIDATED'),
        );
        warnSpy.mockRestore();
      });

      // ─── FIX 4 / RC-8: booking status guard ─────────────────────────
      describe('RC-8 booking status guard', () => {
        it('does not push to affectedBookings (no FCM) when the booking already finalized', async () => {
          const bookedSlot = {
            _id: new Types.ObjectId(),
            status: SlotStatus.BOOKED,
            version: 1,
            startTime: '08:00',
            endTime: '08:30',
            location: jobData.deletedWorkingHour.location,
          };

          mockSlotModel.find.mockReturnValue({
            session: jest.fn().mockResolvedValue([bookedSlot]),
          });

          // Booking lookup returns a booking that the patient already cancelled.
          const bookingId = new Types.ObjectId();
          const patientId = new Types.ObjectId();
          mockBookingModel.findOne.mockReturnValue({
            populate: jest.fn().mockReturnValue({
              populate: jest.fn().mockReturnValue({
                session: jest.fn().mockReturnValue({
                  exec: jest.fn().mockResolvedValue({
                    _id: bookingId,
                    patientId: { _id: patientId, fcmToken: 'tok-x' },
                    doctorId: {
                      _id: new Types.ObjectId(doctorId),
                      firstName: 'Dr',
                      lastName: 'Who',
                    },
                    bookingDate: new Date('2025-06-01'),
                    bookingTime: '08:00',
                  }),
                }),
              }),
            }),
          });

          // Guarded booking update misses (booking already cancelled by patient).
          mockBookingModel.updateOne.mockResolvedValueOnce({
            modifiedCount: 0,
          });

          const infoSpy = jest
            .spyOn((processor as any).logger, 'log')
            .mockImplementation(() => {});

          // Spy on the FCM send path.
          const sendSpy = jest
            .spyOn(processor as any, 'sendCancellationNotifications')
            .mockResolvedValue(undefined);

          await processor.processWorkingHoursDelete({ data: jobData } as any);

          // Guarded update was attempted with the actionable-status filter.
          expect(mockBookingModel.updateOne).toHaveBeenCalledWith(
            {
              _id: bookingId,
              status: {
                $in: ['pending', 'confirmed', 'rescheduled'],
              },
            },
            expect.any(Object),
            { session: mockSession },
          );

          expect(infoSpy).toHaveBeenCalledWith(
            expect.stringContaining('already finalized'),
          );

          // Critical: no FCM dispatched for a booking we did not cancel.
          expect(sendSpy).not.toHaveBeenCalled();

          sendSpy.mockRestore();
          infoSpy.mockRestore();
        });

        it('uses status filter [PENDING, CONFIRMED, RESCHEDULED] when cancelling a booked slot', async () => {
          const bookedSlot = {
            _id: new Types.ObjectId(),
            status: SlotStatus.BOOKED,
            version: 1,
            startTime: '08:00',
            endTime: '08:30',
            location: jobData.deletedWorkingHour.location,
          };

          mockSlotModel.find.mockReturnValue({
            session: jest.fn().mockResolvedValue([bookedSlot]),
          });

          const bookingId = new Types.ObjectId();
          mockBookingModel.findOne.mockReturnValue({
            populate: jest.fn().mockReturnValue({
              populate: jest.fn().mockReturnValue({
                session: jest.fn().mockReturnValue({
                  exec: jest.fn().mockResolvedValue({
                    _id: bookingId,
                    patientId: { _id: new Types.ObjectId(), fcmToken: 'tok' },
                    doctorId: {
                      _id: new Types.ObjectId(doctorId),
                      firstName: 'Dr',
                      lastName: 'Who',
                    },
                    bookingDate: new Date('2025-06-01'),
                    bookingTime: '08:00',
                  }),
                }),
              }),
            }),
          });

          await processor.processWorkingHoursDelete({ data: jobData } as any);

          expect(mockBookingModel.updateOne).toHaveBeenCalledWith(
            expect.objectContaining({
              _id: bookingId,
              status: {
                $in: ['pending', 'confirmed', 'rescheduled'],
              },
            }),
            expect.objectContaining({
              $set: expect.objectContaining({
                status: 'cancelled_by_doctor',
              }),
            }),
            { session: mockSession },
          );
        });
      });

      it('logs a warning and skips when the slot disappeared between read and re-fetch', async () => {
        const racedSlot = {
          _id: new Types.ObjectId(),
          status: SlotStatus.AVAILABLE,
          version: 1,
          startTime: '08:00',
          endTime: '08:30',
          location: jobData.deletedWorkingHour.location,
        };

        mockSlotModel.find.mockReturnValue({
          session: jest.fn().mockResolvedValue([racedSlot]),
        });
        mockSlotModel.updateOne.mockResolvedValueOnce({ modifiedCount: 0 });
        mockSlotModel.findById.mockReturnValue({
          session: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue(null),
          }),
        });

        const warnSpy = jest
          .spyOn((processor as any).logger, 'warn')
          .mockImplementation(() => {});

        await processor.processWorkingHoursDelete({ data: jobData } as any);

        expect(mockSlotModel.updateOne).toHaveBeenCalledTimes(1);
        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining('disappeared'),
        );
        warnSpy.mockRestore();
      });
    });

    it('aborts the transaction when the slot query throws', async () => {
      mockSlotModel.find.mockReturnValue({
        session: jest.fn().mockRejectedValue(new Error('DB error')),
      });

      const mockJob = { data: jobData } as any;
      await expect(
        processor.processWorkingHoursDelete(mockJob),
      ).rejects.toThrow('DB error');

      expect(mockSession.abortTransaction).toHaveBeenCalled();
    });
  });

  // ─── Idempotency Lock ─────────────────────────────────────────────────────

  describe('Redis idempotency lock', () => {
    it('acquires the per-day lock with the documented key + 300s TTL', async () => {
      mockSlotModel.find.mockReturnValue({
        session: jest.fn().mockResolvedValue([]),
      });

      await processor.processWorkingHoursDelete({ data: jobData } as any);

      expect(mockCacheService.acquireLock).toHaveBeenCalledWith(
        `lock:working_hours_delete:${doctorId}:${Days.MONDAY}`,
        300,
      );
    });

    it('skips the job without starting a transaction when the lock is already held', async () => {
      mockCacheService.acquireLock.mockResolvedValue(false);
      const warnSpy = jest
        .spyOn((processor as any).logger, 'warn')
        .mockImplementation(() => {});

      await processor.processWorkingHoursDelete({ data: jobData } as any);

      expect(mockConnection.startSession).not.toHaveBeenCalled();
      expect(mockSlotModel.find).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('lock '));
      warnSpy.mockRestore();
    });

    it('skips cleanly when another holder owns the lock (acquireLock returns false)', async () => {
      // `false` represents lock contention — a peer worker owns the key.
      mockCacheService.acquireLock.mockResolvedValue(false);

      await expect(
        processor.processWorkingHoursDelete({ data: jobData } as any),
      ).resolves.toBeUndefined();

      expect(mockConnection.startSession).not.toHaveBeenCalled();
    });

    it('throws so Bull retries when Redis is unavailable (acquireLock returns null)', async () => {
      mockCacheService.acquireLock.mockResolvedValueOnce(null);

      await expect(
        processor.processWorkingHoursDelete({ data: jobData } as any),
      ).rejects.toThrow(/Redis unavailable/);

      expect(mockConnection.startSession).not.toHaveBeenCalled();
      expect(mockCacheService.releaseLock).not.toHaveBeenCalled();
    });

    it('releases the lock after a successful run so follow-ups proceed', async () => {
      mockSlotModel.find.mockReturnValue({
        session: jest.fn().mockResolvedValue([]),
      });

      await processor.processWorkingHoursDelete({ data: jobData } as any);

      expect(mockCacheService.releaseLock).toHaveBeenCalledWith(
        `lock:working_hours_delete:${doctorId}:${Days.MONDAY}`,
        'mock-token',
      );
    });

    it('releases the lock even when the transaction aborts', async () => {
      mockSlotModel.find.mockReturnValue({
        session: jest.fn().mockRejectedValue(new Error('DB down')),
      });

      await expect(
        processor.processWorkingHoursDelete({ data: jobData } as any),
      ).rejects.toThrow('DB down');

      expect(mockCacheService.releaseLock).toHaveBeenCalledWith(
        `lock:working_hours_delete:${doctorId}:${Days.MONDAY}`,
        'mock-token',
      );
    });
  });

  // ─── RC-3 (FIX 3): cross-op outer :ALL lock ─────────────────────────────
  describe('RC-3 cross-op :ALL outer lock', () => {
    beforeEach(() => {
      // Reset slot find to a clean empty result; prior tests leave behind
      // implementations (e.g. rejected promises) via mockReturnValue.
      mockSlotModel.find.mockReturnValue({
        session: jest.fn().mockResolvedValue([]),
      });
    });

    it('acquires the doctor-wide :ALL lock AFTER the per-day lock', async () => {
      const acquireOrder: string[] = [];
      mockCacheService.acquireLock.mockImplementation((key: string) => {
        acquireOrder.push(key);
        return Promise.resolve('mock-token');
      });

      await processor.processWorkingHoursDelete({ data: jobData } as any);

      expect(acquireOrder).toEqual([
        `lock:working_hours_delete:${doctorId}:${Days.MONDAY}`,
        `lock:doctor:${doctorId}:ALL`,
      ]);
      expect(mockCacheService.acquireLock).toHaveBeenCalledWith(
        `lock:doctor:${doctorId}:ALL`,
        300,
      );
    });

    it('throws on :ALL contention, releases the per-day lock, and never enters the transaction', async () => {
      // First acquire (day-lock) succeeds; second (:ALL) is contended.
      mockCacheService.acquireLock
        .mockResolvedValueOnce('day-token')
        .mockResolvedValueOnce(false);
      const warnSpy = jest
        .spyOn((processor as any).logger, 'warn')
        .mockImplementation(() => {});

      await expect(
        processor.processWorkingHoursDelete({ data: jobData } as any),
      ).rejects.toThrow(/Cross-op lock .* held/);

      // Day-lock must be released (cleanup before throwing).
      expect(mockCacheService.releaseLock).toHaveBeenCalledWith(
        `lock:working_hours_delete:${doctorId}:${Days.MONDAY}`,
        'day-token',
      );
      // :ALL never acquired → never released.
      expect(mockCacheService.releaseLock).not.toHaveBeenCalledWith(
        `lock:doctor:${doctorId}:ALL`,
        expect.anything(),
      );
      // Inner work never started.
      expect(mockConnection.startSession).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Contended'));
      warnSpy.mockRestore();
    });

    it('throws on :ALL Redis-down, releases the per-day lock', async () => {
      mockCacheService.acquireLock
        .mockResolvedValueOnce('day-token')
        .mockResolvedValueOnce(null);

      await expect(
        processor.processWorkingHoursDelete({ data: jobData } as any),
      ).rejects.toThrow(/Redis unavailable acquiring lock:doctor:.*:ALL/);

      expect(mockCacheService.releaseLock).toHaveBeenCalledWith(
        `lock:working_hours_delete:${doctorId}:${Days.MONDAY}`,
        'day-token',
      );
    });

    it('releases :ALL BEFORE the per-day lock in finally (reverse acquire order)', async () => {
      const releaseOrder: string[] = [];
      mockCacheService.releaseLock.mockImplementation((key: string) => {
        releaseOrder.push(key);
        return Promise.resolve(undefined);
      });

      await processor.processWorkingHoursDelete({ data: jobData } as any);

      expect(releaseOrder).toEqual([
        `lock:doctor:${doctorId}:ALL`,
        `lock:working_hours_delete:${doctorId}:${Days.MONDAY}`,
      ]);
    });
  });

  // ─── Phase 1 / Phase 2 split ────────────────────────────────────────────
  describe('Phase 1 / Phase 2 split', () => {
    beforeEach(() => {
      mockSlotModel.find.mockReturnValue({
        session: jest.fn().mockResolvedValue([]),
      });
    });

    it('dispatches Phase 2 via selfQueue.add after a successful Phase 1', async () => {
      await processor.processWorkingHoursDelete({ data: jobData } as any);

      expect(mockQueue.add).toHaveBeenCalledWith(
        'PROCESS_WORKING_HOURS_DELETE_PHASE2',
        jobData,
      );
    });

    it('does not dispatch Phase 2 when Phase 1 throws', async () => {
      mockSlotModel.find.mockReturnValue({
        session: jest.fn().mockRejectedValue(new Error('DB down')),
      });

      await expect(
        processor.processWorkingHoursDelete({ data: jobData } as any),
      ).rejects.toThrow('DB down');

      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('does not throw when Phase 2 dispatch fails (Phase 1 stands)', async () => {
      mockQueue.add.mockRejectedValueOnce(new Error('Bull down'));
      const errorSpy = jest
        .spyOn((processor as any).logger, 'error')
        .mockImplementation(() => {});

      await expect(
        processor.processWorkingHoursDelete({ data: jobData } as any),
      ).resolves.toBeUndefined();

      await new Promise((resolve) => setImmediate(resolve));

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to dispatch Phase 2'),
        expect.anything(),
      );
      errorSpy.mockRestore();
    });

    it('Phase 2 handler acquires the :backfill lock', async () => {
      await processor.processWorkingHoursDeletePhase2({
        data: jobData,
      } as any);

      expect(mockCacheService.acquireLock).toHaveBeenCalledWith(
        `lock:working_hours_delete:${doctorId}:${Days.MONDAY}:backfill`,
        300,
      );
    });

    it('Phase 2 handler releases the :backfill lock after completion', async () => {
      await processor.processWorkingHoursDeletePhase2({
        data: jobData,
      } as any);

      expect(mockCacheService.releaseLock).toHaveBeenCalledWith(
        `lock:working_hours_delete:${doctorId}:${Days.MONDAY}:backfill`,
        'mock-token',
      );
    });

    it('Phase 2 handler does not chain another Phase 2', async () => {
      await processor.processWorkingHoursDeletePhase2({
        data: jobData,
      } as any);

      expect(mockQueue.add).not.toHaveBeenCalled();
    });
  });

  // ─── RC-6 (FIX 6): Phase 2 staleness check ─────────────────────────────
  describe('RC-6 Phase 2 staleness check', () => {
    beforeEach(() => {
      // Clean default for slot.find used by the rest of the run.
      mockSlotModel.find.mockReturnValue({
        session: jest.fn().mockResolvedValue([]),
      });
    });

    it('proceeds with Phase 2 when doctor.workingHoursVersion equals job.version', async () => {
      // jobData.version = 1; doctor.workingHoursVersion = 1 → not stale.
      mockDoctorModel.findById.mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue({ workingHoursVersion: 1 }),
          }),
        }),
      });

      await processor.processWorkingHoursDeletePhase2({
        data: jobData,
      } as any);

      expect(mockCacheService.acquireLock).toHaveBeenCalledWith(
        `lock:working_hours_delete:${doctorId}:${Days.MONDAY}:backfill`,
        300,
      );
      expect(mockConnection.startSession).toHaveBeenCalled();
    });

    it('skips Phase 2 when doctor.workingHoursVersion has advanced past job.version', async () => {
      mockDoctorModel.findById.mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue({ workingHoursVersion: 7 }),
          }),
        }),
      });
      const warnSpy = jest
        .spyOn((processor as any).logger, 'warn')
        .mockImplementation(() => {});

      await processor.processWorkingHoursDeletePhase2({
        data: jobData,
      } as any);

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

      await processor.processWorkingHoursDeletePhase2({
        data: jobData,
      } as any);

      expect(mockCacheService.acquireLock).not.toHaveBeenCalled();
    });

    it('Phase 1 handler is NOT staleness-checked (always runs)', async () => {
      mockDoctorModel.findById.mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue({ workingHoursVersion: 999 }),
          }),
        }),
      });

      await processor.processWorkingHoursDelete({ data: jobData } as any);

      expect(mockCacheService.acquireLock).toHaveBeenCalledWith(
        `lock:working_hours_delete:${doctorId}:${Days.MONDAY}`,
        300,
      );
      expect(mockConnection.startSession).toHaveBeenCalled();
    });
  });
});
