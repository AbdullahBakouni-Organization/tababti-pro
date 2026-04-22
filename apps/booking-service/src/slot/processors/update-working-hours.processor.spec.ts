import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { getConnectionToken } from '@nestjs/mongoose';
import { getQueueToken } from '@nestjs/bull';
import { Types } from 'mongoose';
import { DateTime } from 'luxon';
import {
  WorkingHoursUpdateProcessorV2,
  WorkingHoursUpdateJobData,
} from './update-working-hours.processor';
import { AppointmentSlot } from '@app/common/database/schemas/slot.schema';
import { Booking } from '@app/common/database/schemas/booking.schema';
import { Doctor } from '@app/common/database/schemas/doctor.schema';
import { KafkaService } from '@app/common/kafka/kafka.service';
import { CacheService } from '@app/common/cache/cache.service';
import { Days, SlotStatus } from '@app/common/database/schemas/common.enums';
import { invalidateBookingCaches } from '@app/common/utils/cache-invalidation.util';

// Matches the processor's window-start calculation so mocked slots land in
// the same date bucket as the bulk-fetch grouping.
const firstFutureMonday = (() => {
  let dt = DateTime.now().setZone('Asia/Damascus').startOf('day');
  while (dt.weekday !== 1) dt = dt.plus({ days: 1 });
  return new Date(Date.UTC(dt.year, dt.month - 1, dt.day, 0, 0, 0, 0));
})();

jest.mock('@app/common/utils/cache-invalidation.util', () => ({
  invalidateBookingCaches: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@app/common/utils/get-syria-date', () => ({
  formatDate: jest.fn().mockReturnValue('2025-01-01'),
}));

describe('WorkingHoursUpdateProcessorV2', () => {
  let processor: WorkingHoursUpdateProcessorV2;

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

  const _mockSlot = {
    _id: new Types.ObjectId(),
    status: SlotStatus.AVAILABLE,
    save: jest.fn().mockResolvedValue(undefined),
    'location.type': 'PRIVATE',
    'location.entity_name': 'Clinic',
    'location.address': 'Damascus',
  };

  const mockSlotModel = {
    find: jest.fn(),
    findOne: jest.fn(),
    findById: jest.fn(),
    create: jest.fn().mockResolvedValue({}),
    insertMany: jest.fn().mockResolvedValue([]),
    deleteMany: jest.fn().mockResolvedValue({ deletedCount: 0 }),
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
    invalidatePattern: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
    invalidate: jest.fn().mockResolvedValue(undefined),
    acquireLock: jest.fn().mockResolvedValue('mock-token'),
    releaseLock: jest.fn().mockResolvedValue(undefined),
    set: jest.fn().mockResolvedValue(undefined),
  };

  const mockQueue = {
    add: jest.fn().mockResolvedValue(undefined),
  };

  // FIX 6: Doctor model — Phase 2 staleness check.
  const mockDoctorModel = {
    findById: jest.fn(),
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
        WorkingHoursUpdateProcessorV2,
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
          provide: getQueueToken('WORKING_HOURS_UPDATE'),
          useValue: mockQueue,
        },
      ],
    }).compile();

    processor = module.get<WorkingHoursUpdateProcessorV2>(
      WorkingHoursUpdateProcessorV2,
    );
  });

  it('should be defined', () => {
    expect(processor).toBeDefined();
  });

  describe('processWorkingHoursUpdate()', () => {
    const jobData: WorkingHoursUpdateJobData = {
      doctorId,
      oldWorkingHours: [
        {
          day: Days.MONDAY,
          location: {
            type: 'PRIVATE' as any,
            entity_name: 'Old Clinic',
            address: 'Old Address',
          },
          startTime: '08:00',
          endTime: '12:00',
        },
      ],
      newWorkingHours: [
        {
          day: Days.MONDAY,
          location: {
            type: 'PRIVATE' as any,
            entity_name: 'New Clinic',
            address: 'New Address',
          },
          startTime: '09:00',
          endTime: '13:00',
        },
      ],
      inspectionDuration: 30,
      inspectionPrice: 5000,
      version: 2,
      updatedDays: [Days.MONDAY],
    };

    // ─── FIX 5 / RC-7: cache invalidation runs AFTER commit, unconditionally ───
    describe('RC-7 cache invalidation order', () => {
      it('calls invalidateBookingCaches AFTER commitTransaction', async () => {
        mockSlotModel.find.mockReturnValue({
          session: jest.fn().mockResolvedValue([]),
        });
        mockSlotModel.findOne.mockReturnValue({
          session: jest.fn().mockResolvedValue(null),
        });

        // Track relative ordering using jest's invocation order via a marker.
        const callOrder: string[] = [];
        mockSession.commitTransaction.mockImplementationOnce(async () => {
          callOrder.push('commit');
        });
        (invalidateBookingCaches as jest.Mock).mockImplementationOnce(
          async () => {
            callOrder.push('invalidate');
          },
        );

        await processor.processWorkingHoursUpdate({ data: jobData } as any);

        expect(callOrder).toEqual(['commit', 'invalidate']);
      });

      it('invalidates the cache UNCONDITIONALLY even with zero affected bookings', async () => {
        mockSlotModel.find.mockReturnValue({
          session: jest.fn().mockResolvedValue([]),
        });
        mockSlotModel.findOne.mockReturnValue({
          session: jest.fn().mockResolvedValue(null),
        });

        await processor.processWorkingHoursUpdate({ data: jobData } as any);

        // Doctor-wide invalidation — patientId is undefined when nobody got
        // notified. Without this fix, edits without booked slots left the
        // doctor's cache stale for up to 2h.
        expect(invalidateBookingCaches).toHaveBeenCalledWith(
          expect.anything(),
          doctorId,
          undefined,
          expect.anything(),
        );
      });

      it('invalidates the cache with the affectedPatientIds when bookings were cancelled', async () => {
        const bookedSlot = {
          _id: new Types.ObjectId(),
          status: SlotStatus.BOOKED,
          version: 1,
          startTime: '07:00',
          endTime: '07:30',
          date: firstFutureMonday,
          location: {
            type: 'PRIVATE' as any,
            entity_name: 'Old Clinic',
            address: 'Old Address',
          },
        };

        mockSlotModel.find.mockReturnValue({
          session: jest.fn().mockResolvedValue([bookedSlot]),
        });
        mockSlotModel.findOne.mockReturnValue({
          session: jest.fn().mockResolvedValue(null),
        });

        const patientId = new Types.ObjectId();
        mockBookingModel.findOne.mockReturnValue({
          populate: jest.fn().mockReturnValue({
            populate: jest.fn().mockReturnValue({
              session: jest.fn().mockReturnValue({
                exec: jest.fn().mockResolvedValue({
                  _id: new Types.ObjectId(),
                  patientId: { _id: patientId, fcmToken: 'tok-x' },
                  doctorId: {
                    _id: new Types.ObjectId(doctorId),
                    firstName: 'Dr',
                    lastName: 'Who',
                  },
                  bookingDate: new Date('2025-06-01'),
                  bookingTime: '07:00',
                }),
              }),
            }),
          }),
        });

        await processor.processWorkingHoursUpdate({ data: jobData } as any);

        expect(invalidateBookingCaches).toHaveBeenCalledWith(
          expect.anything(),
          doctorId,
          [patientId.toString()],
          expect.anything(),
        );
      });
    });

    it('processes working hours update without errors when no slots found', async () => {
      mockSlotModel.find.mockReturnValue({
        session: jest.fn().mockResolvedValue([]),
      });
      // generateNewSlotsForDate uses findOne to check existing slot before creating
      mockSlotModel.findOne.mockReturnValue({
        session: jest.fn().mockResolvedValue(null),
      });
      mockSlotModel.create.mockResolvedValue({});

      const mockJob = { data: jobData } as any;

      await expect(
        processor.processWorkingHoursUpdate(mockJob),
      ).resolves.not.toThrow();

      expect(mockConnection.startSession).toHaveBeenCalled();
      expect(mockSession.startTransaction).toHaveBeenCalled();
      expect(mockSession.commitTransaction).toHaveBeenCalled();
    });

    it('invalidates AVAILABLE slots that no longer fit new working hours', async () => {
      // Slot is at 07:00-07:30 which is OUTSIDE the new 09:00-13:00 range
      const availableSlot = {
        _id: new Types.ObjectId(),
        status: SlotStatus.AVAILABLE,
        version: 1,
        startTime: '07:00',
        endTime: '07:30',
        date: firstFutureMonday,
        location: {
          type: 'PRIVATE' as any,
          entity_name: 'Old Clinic',
          address: 'Old Address',
        },
      };

      mockSlotModel.find.mockReturnValue({
        session: jest.fn().mockResolvedValue([availableSlot]),
      });

      // generateNewSlotsForDate calls findOne to check for existing slots
      mockSlotModel.findOne.mockReturnValue({
        session: jest.fn().mockResolvedValue(null),
      });

      const mockJob = { data: jobData } as any;
      await processor.processWorkingHoursUpdate(mockJob);

      // RC-3 guard: status filter on _id+status, not unconditional save
      expect(mockSlotModel.updateOne).toHaveBeenCalledWith(
        { _id: availableSlot._id, status: SlotStatus.AVAILABLE },
        {
          $set: { status: SlotStatus.INVALIDATED },
          $inc: { version: 1 },
        },
        { session: mockSession },
      );
    });

    // ─── FIX 1 / RC-3: status guard with re-fetch on race ─────────────────
    describe('RC-3 status-guarded invalidate', () => {
      it('re-fetches and cancels the booking when the slot raced from AVAILABLE to BOOKED', async () => {
        const racedSlot = {
          _id: new Types.ObjectId(),
          status: SlotStatus.AVAILABLE,
          version: 3,
          startTime: '07:00',
          endTime: '07:30',
          date: firstFutureMonday,
          location: {
            type: 'PRIVATE' as any,
            entity_name: 'Old Clinic',
            address: 'Old Address',
          },
        };

        mockSlotModel.find.mockReturnValue({
          session: jest.fn().mockResolvedValue([racedSlot]),
        });
        mockSlotModel.findOne.mockReturnValue({
          session: jest.fn().mockResolvedValue(null),
        });

        // First updateOne (AVAILABLE) misses, second updateOne (BOOKED) succeeds.
        mockSlotModel.updateOne
          .mockResolvedValueOnce({ modifiedCount: 0 })
          .mockResolvedValueOnce({ modifiedCount: 1 });

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

        // Booking lookup for the racing booking — sets up populate chain.
        mockBookingModel.findOne.mockReturnValue({
          populate: jest.fn().mockReturnValue({
            populate: jest.fn().mockReturnValue({
              session: jest.fn().mockReturnValue({
                exec: jest.fn().mockResolvedValue({
                  _id: new Types.ObjectId(),
                  patientId: { _id: new Types.ObjectId(), fcmToken: 'tok-x' },
                  doctorId: {
                    _id: new Types.ObjectId(doctorId),
                    firstName: 'Dr',
                    lastName: 'Who',
                  },
                  bookingDate: new Date('2025-06-01'),
                  bookingTime: '07:00',
                }),
              }),
            }),
          }),
        });

        const warnSpy = jest
          .spyOn((processor as any).logger, 'warn')
          .mockImplementation(() => {});

        await processor.processWorkingHoursUpdate({ data: jobData } as any);

        expect(mockSlotModel.updateOne).toHaveBeenNthCalledWith(
          1,
          { _id: racedSlot._id, status: SlotStatus.AVAILABLE },
          expect.any(Object),
          { session: mockSession },
        );
        expect(mockSlotModel.findById).toHaveBeenCalledWith(racedSlot._id);
        // RC-8 guard: filter by booking _id + actionable statuses.
        expect(mockBookingModel.updateOne).toHaveBeenCalledWith(
          {
            _id: expect.any(Types.ObjectId),
            status: {
              $in: ['pending', 'confirmed', 'rescheduled'],
            },
          },
          expect.objectContaining({
            $set: expect.objectContaining({
              cancellation: expect.objectContaining({ cancelledBy: 'SYSTEM' }),
            }),
          }),
          { session: mockSession },
        );
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
          startTime: '07:00',
          endTime: '07:30',
          date: firstFutureMonday,
          location: {
            type: 'PRIVATE' as any,
            entity_name: 'Old Clinic',
            address: 'Old Address',
          },
        };

        mockSlotModel.find.mockReturnValue({
          session: jest.fn().mockResolvedValue([racedSlot]),
        });
        mockSlotModel.findOne.mockReturnValue({
          session: jest.fn().mockResolvedValue(null),
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

        await processor.processWorkingHoursUpdate({ data: jobData } as any);

        // Initial guarded write only — no booking lookup, no retry.
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
            startTime: '07:00',
            endTime: '07:30',
            date: firstFutureMonday,
            location: {
              type: 'PRIVATE' as any,
              entity_name: 'Old Clinic',
              address: 'Old Address',
            },
          };

          mockSlotModel.find.mockReturnValue({
            session: jest.fn().mockResolvedValue([bookedSlot]),
          });
          mockSlotModel.findOne.mockReturnValue({
            session: jest.fn().mockResolvedValue(null),
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
                    bookingTime: '07:00',
                  }),
                }),
              }),
            }),
          });

          // Booking already finalized — guarded update returns 0.
          mockBookingModel.updateOne.mockResolvedValueOnce({
            modifiedCount: 0,
          });

          const infoSpy = jest
            .spyOn((processor as any).logger, 'log')
            .mockImplementation(() => {});

          const sendSpy = jest
            .spyOn(processor as any, 'sendPersonalizedNotifications')
            .mockResolvedValue(undefined);

          await processor.processWorkingHoursUpdate({ data: jobData } as any);

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

        it('uses status filter [PENDING, CONFIRMED, RESCHEDULED] with NEEDS_RESCHEDULE / SYSTEM cancellation', async () => {
          const bookedSlot = {
            _id: new Types.ObjectId(),
            status: SlotStatus.BOOKED,
            version: 1,
            startTime: '07:00',
            endTime: '07:30',
            date: firstFutureMonday,
            location: {
              type: 'PRIVATE' as any,
              entity_name: 'Old Clinic',
              address: 'Old Address',
            },
          };

          mockSlotModel.find.mockReturnValue({
            session: jest.fn().mockResolvedValue([bookedSlot]),
          });
          mockSlotModel.findOne.mockReturnValue({
            session: jest.fn().mockResolvedValue(null),
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
                    bookingTime: '07:00',
                  }),
                }),
              }),
            }),
          });

          await processor.processWorkingHoursUpdate({ data: jobData } as any);

          expect(mockBookingModel.updateOne).toHaveBeenCalledWith(
            {
              _id: bookingId,
              status: {
                $in: ['pending', 'confirmed', 'rescheduled'],
              },
            },
            expect.objectContaining({
              $set: expect.objectContaining({
                status: 'needs_reschedule',
                cancellation: expect.objectContaining({
                  cancelledBy: 'SYSTEM',
                }),
              }),
            }),
            { session: mockSession },
          );
        });
      });

      it('warns and skips when the slot disappeared between read and re-fetch', async () => {
        const racedSlot = {
          _id: new Types.ObjectId(),
          status: SlotStatus.AVAILABLE,
          version: 1,
          startTime: '07:00',
          endTime: '07:30',
          date: firstFutureMonday,
          location: {
            type: 'PRIVATE' as any,
            entity_name: 'Old Clinic',
            address: 'Old Address',
          },
        };

        mockSlotModel.find.mockReturnValue({
          session: jest.fn().mockResolvedValue([racedSlot]),
        });
        mockSlotModel.findOne.mockReturnValue({
          session: jest.fn().mockResolvedValue(null),
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

        await processor.processWorkingHoursUpdate({ data: jobData } as any);

        expect(mockSlotModel.updateOne).toHaveBeenCalledTimes(1);
        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining('disappeared'),
        );
        warnSpy.mockRestore();
      });
    });

    it('aborts transaction on error', async () => {
      mockSlotModel.find.mockReturnValue({
        session: jest.fn().mockRejectedValue(new Error('DB error')),
      });

      const mockJob = { data: jobData } as any;

      await expect(
        processor.processWorkingHoursUpdate(mockJob),
      ).rejects.toThrow('DB error');

      expect(mockSession.abortTransaction).toHaveBeenCalled();
    });
  });

  // ─── Redis idempotency lock ──────────────────────────────────────────────
  describe('Redis idempotency lock', () => {
    const jobData: WorkingHoursUpdateJobData = {
      doctorId,
      oldWorkingHours: [],
      newWorkingHours: [
        {
          day: Days.MONDAY,
          location: {
            type: 'PRIVATE' as any,
            entity_name: 'New Clinic',
            address: 'New Address',
          },
          startTime: '09:00',
          endTime: '13:00',
        },
      ],
      inspectionDuration: 30,
      inspectionPrice: 5000,
      version: 2,
      updatedDays: [Days.MONDAY],
    };

    beforeEach(() => {
      mockSlotModel.find.mockReturnValue({
        session: jest.fn().mockResolvedValue([]),
      });
      mockSlotModel.findOne.mockReturnValue({
        session: jest.fn().mockResolvedValue(null),
      });
    });

    it('acquires the per-day lock with the documented key + 300s TTL', async () => {
      await processor.processWorkingHoursUpdate({ data: jobData } as any);

      expect(mockCacheService.acquireLock).toHaveBeenCalledWith(
        `lock:working_hours_update:${doctorId}:${Days.MONDAY}`,
        300,
      );
    });

    it('skips the day without starting a transaction when lock is already held', async () => {
      mockCacheService.acquireLock.mockResolvedValueOnce(false);
      const warnSpy = jest
        .spyOn((processor as any).logger, 'warn')
        .mockImplementation(() => {});

      await processor.processWorkingHoursUpdate({ data: jobData } as any);

      expect(mockConnection.startSession).not.toHaveBeenCalled();
      expect(mockSlotModel.find).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('lock '));
      warnSpy.mockRestore();
    });

    it('releases the lock after a successful run so legitimate follow-ups proceed', async () => {
      await processor.processWorkingHoursUpdate({ data: jobData } as any);

      expect(mockCacheService.releaseLock).toHaveBeenCalledWith(
        `lock:working_hours_update:${doctorId}:${Days.MONDAY}`,
        'mock-token',
      );
    });

    it('releases the lock even when the transaction aborts', async () => {
      mockSlotModel.find.mockReturnValue({
        session: jest.fn().mockRejectedValue(new Error('DB down')),
      });

      await expect(
        processor.processWorkingHoursUpdate({ data: jobData } as any),
      ).rejects.toThrow('DB down');

      expect(mockCacheService.releaseLock).toHaveBeenCalledWith(
        `lock:working_hours_update:${doctorId}:${Days.MONDAY}`,
        'mock-token',
      );
    });

    it('throws so Bull retries when Redis is unavailable (acquireLock returns null)', async () => {
      mockCacheService.acquireLock.mockResolvedValueOnce(null);

      await expect(
        processor.processWorkingHoursUpdate({ data: jobData } as any),
      ).rejects.toThrow(/Redis unavailable/);

      // Never started DB work, never released a lock we never acquired
      expect(mockConnection.startSession).not.toHaveBeenCalled();
      expect(mockCacheService.releaseLock).not.toHaveBeenCalled();
    });

    it('warns when updatedDays contains a day with no matching newWorkingHours entry', async () => {
      const warnSpy = jest
        .spyOn((processor as any).logger, 'warn')
        .mockImplementation(() => {});

      const mismatched: WorkingHoursUpdateJobData = {
        ...jobData,
        newWorkingHours: [],
      };

      await processor.processWorkingHoursUpdate({ data: mismatched } as any);

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('No newWorkingHours entries for day='),
      );
      warnSpy.mockRestore();
    });
  });

  // ─── RC-3 (FIX 3): cross-op outer :ALL lock ─────────────────────────────
  describe('RC-3 cross-op :ALL outer lock', () => {
    const jobData: WorkingHoursUpdateJobData = {
      doctorId,
      oldWorkingHours: [],
      newWorkingHours: [
        {
          day: Days.MONDAY,
          location: {
            type: 'PRIVATE' as any,
            entity_name: 'Clinic',
            address: 'Addr',
          },
          startTime: '09:00',
          endTime: '13:00',
        },
      ],
      inspectionDuration: 30,
      inspectionPrice: 5000,
      version: 2,
      updatedDays: [Days.MONDAY],
    };

    beforeEach(() => {
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

      await processor.processWorkingHoursUpdate({ data: jobData } as any);

      expect(acquireOrder).toEqual([
        `lock:working_hours_update:${doctorId}:${Days.MONDAY}`,
        `lock:doctor:${doctorId}:ALL`,
      ]);
      expect(mockCacheService.acquireLock).toHaveBeenCalledWith(
        `lock:doctor:${doctorId}:ALL`,
        300,
      );
    });

    it('throws on :ALL contention, releases the per-day lock, and never enters the transaction', async () => {
      mockCacheService.acquireLock
        .mockResolvedValueOnce('day-token')
        .mockResolvedValueOnce(false);
      const warnSpy = jest
        .spyOn((processor as any).logger, 'warn')
        .mockImplementation(() => {});

      await expect(
        processor.processWorkingHoursUpdate({ data: jobData } as any),
      ).rejects.toThrow(/Cross-op lock .* held/);

      expect(mockCacheService.releaseLock).toHaveBeenCalledWith(
        `lock:working_hours_update:${doctorId}:${Days.MONDAY}`,
        'day-token',
      );
      expect(mockCacheService.releaseLock).not.toHaveBeenCalledWith(
        `lock:doctor:${doctorId}:ALL`,
        expect.anything(),
      );
      expect(mockConnection.startSession).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Contended'));
      warnSpy.mockRestore();
    });

    it('throws on :ALL Redis-down, releases the per-day lock', async () => {
      mockCacheService.acquireLock
        .mockResolvedValueOnce('day-token')
        .mockResolvedValueOnce(null);

      await expect(
        processor.processWorkingHoursUpdate({ data: jobData } as any),
      ).rejects.toThrow(/Redis unavailable acquiring lock:doctor:.*:ALL/);

      expect(mockCacheService.releaseLock).toHaveBeenCalledWith(
        `lock:working_hours_update:${doctorId}:${Days.MONDAY}`,
        'day-token',
      );
    });

    it('releases :ALL BEFORE the per-day lock in finally (reverse acquire order)', async () => {
      const releaseOrder: string[] = [];
      mockCacheService.releaseLock.mockImplementation((key: string) => {
        releaseOrder.push(key);
        return Promise.resolve(undefined);
      });

      await processor.processWorkingHoursUpdate({ data: jobData } as any);

      expect(releaseOrder).toEqual([
        `lock:doctor:${doctorId}:ALL`,
        `lock:working_hours_update:${doctorId}:${Days.MONDAY}`,
      ]);
    });
  });

  // ─── Phase 1 / Phase 2 split ────────────────────────────────────────────
  describe('Phase 1 / Phase 2 split', () => {
    const jobData: WorkingHoursUpdateJobData = {
      doctorId,
      oldWorkingHours: [],
      newWorkingHours: [
        {
          day: Days.MONDAY,
          location: {
            type: 'PRIVATE' as any,
            entity_name: 'New Clinic',
            address: 'New Address',
          },
          startTime: '09:00',
          endTime: '13:00',
        },
      ],
      inspectionDuration: 30,
      inspectionPrice: 5000,
      version: 2,
      updatedDays: [Days.MONDAY],
    };

    beforeEach(() => {
      mockSlotModel.find.mockReturnValue({
        session: jest.fn().mockResolvedValue([]),
      });
      mockSlotModel.findOne.mockReturnValue({
        session: jest.fn().mockResolvedValue(null),
      });
    });

    it('dispatches Phase 2 via selfQueue.add after a successful Phase 1', async () => {
      await processor.processWorkingHoursUpdate({ data: jobData } as any);

      expect(mockQueue.add).toHaveBeenCalledWith(
        'PROCESS_WORKING_HOURS_UPDATE_PHASE2',
        jobData,
      );
    });

    it('does not dispatch Phase 2 when Phase 1 throws', async () => {
      mockSlotModel.find.mockReturnValue({
        session: jest.fn().mockRejectedValue(new Error('DB down')),
      });

      await expect(
        processor.processWorkingHoursUpdate({ data: jobData } as any),
      ).rejects.toThrow('DB down');

      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('does not throw when Phase 2 dispatch fails (Phase 1 stands)', async () => {
      mockQueue.add.mockRejectedValueOnce(new Error('Bull down'));
      const errorSpy = jest
        .spyOn((processor as any).logger, 'error')
        .mockImplementation(() => {});

      await expect(
        processor.processWorkingHoursUpdate({ data: jobData } as any),
      ).resolves.toBeUndefined();

      await new Promise((resolve) => setImmediate(resolve));

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to dispatch Phase 2'),
        expect.anything(),
      );
      errorSpy.mockRestore();
    });

    it('Phase 2 handler acquires the :backfill lock', async () => {
      await processor.processWorkingHoursUpdatePhase2({
        data: jobData,
      } as any);

      expect(mockCacheService.acquireLock).toHaveBeenCalledWith(
        `lock:working_hours_update:${doctorId}:${Days.MONDAY}:backfill`,
        300,
      );
    });

    it('Phase 2 handler releases the :backfill lock after completion', async () => {
      await processor.processWorkingHoursUpdatePhase2({
        data: jobData,
      } as any);

      expect(mockCacheService.releaseLock).toHaveBeenCalledWith(
        `lock:working_hours_update:${doctorId}:${Days.MONDAY}:backfill`,
        'mock-token',
      );
    });

    it('Phase 2 handler does not chain another Phase 2', async () => {
      await processor.processWorkingHoursUpdatePhase2({
        data: jobData,
      } as any);

      expect(mockQueue.add).not.toHaveBeenCalled();
    });
  });

  // ─── RC-6 (FIX 6): Phase 2 staleness check ─────────────────────────────
  describe('RC-6 Phase 2 staleness check', () => {
    const jobData: WorkingHoursUpdateJobData = {
      doctorId,
      oldWorkingHours: [],
      newWorkingHours: [
        {
          day: Days.MONDAY,
          location: {
            type: 'PRIVATE' as any,
            entity_name: 'New Clinic',
            address: 'New Address',
          },
          startTime: '09:00',
          endTime: '13:00',
        },
      ],
      inspectionDuration: 30,
      inspectionPrice: 5000,
      version: 2,
      updatedDays: [Days.MONDAY],
    };

    beforeEach(() => {
      mockSlotModel.find.mockReturnValue({
        session: jest.fn().mockResolvedValue([]),
      });
      mockSlotModel.findOne.mockReturnValue({
        session: jest.fn().mockResolvedValue(null),
      });
    });

    it('proceeds with Phase 2 when doctor.workingHoursVersion equals job.version', async () => {
      mockDoctorModel.findById.mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue({ workingHoursVersion: 2 }),
          }),
        }),
      });

      await processor.processWorkingHoursUpdatePhase2({
        data: jobData,
      } as any);

      // Lock acquired → ran Phase 2 normally.
      expect(mockCacheService.acquireLock).toHaveBeenCalledWith(
        `lock:working_hours_update:${doctorId}:${Days.MONDAY}:backfill`,
        300,
      );
    });

    it('skips Phase 2 when doctor.workingHoursVersion has advanced past job.version', async () => {
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

      await processor.processWorkingHoursUpdatePhase2({
        data: jobData,
      } as any);

      // No lock taken, no transaction, no work — newer Phase 1 will dispatch a fresh Phase 2.
      expect(mockCacheService.acquireLock).not.toHaveBeenCalled();
      expect(mockConnection.startSession).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('stale'));
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

      const warnSpy = jest
        .spyOn((processor as any).logger, 'warn')
        .mockImplementation(() => {});

      await processor.processWorkingHoursUpdatePhase2({
        data: jobData,
      } as any);

      expect(mockCacheService.acquireLock).not.toHaveBeenCalled();
      expect(mockConnection.startSession).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('not found'));
      warnSpy.mockRestore();
    });

    it('Phase 1 handler is NOT staleness-checked (always runs)', async () => {
      // Even if doctor.workingHoursVersion is way ahead, Phase 1 still runs —
      // it represents the user's most recent intent at this moment.
      mockDoctorModel.findById.mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue({ workingHoursVersion: 99 }),
          }),
        }),
      });

      await processor.processWorkingHoursUpdate({ data: jobData } as any);

      expect(mockConnection.startSession).toHaveBeenCalled();
      expect(mockDoctorModel.findById).not.toHaveBeenCalled();
    });
  });
});
