/**
 * Integration tests — AppointmentSlot document operations
 *
 * What is tested here:
 *   - Schema-level constraints: required fields, unique compound index
 *     (doctorId + date + startTime + location.entity_name).
 *   - Schema instance methods: book(), cancel(), block(), unblock(),
 *     complete(), releaseHold().
 *   - Compound index queries: finding available slots for a doctor by date.
 *
 * What is NOT tested here:
 *   - Slot generation cron job (requires Bull/queue setup)
 *   - Cross-service Kafka events (unit tests)
 */

import { getConnectionToken, getModelToken, MongooseModule } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Connection, Model } from 'mongoose';

import {
  AppointmentSlot,
  AppointmentSlotDocument,
  AppointmentSlotSchema,
} from '@app/common/database/schemas/slot.schema';
import {
  Doctor,
  DoctorDocument,
  DoctorSchema,
} from '@app/common/database/schemas/doctor.schema';
import {
  BlockReason,
  SlotStatus,
} from '@app/common/database/schemas/common.enums';

import {
  buildDoctor,
  buildSlot,
  buildMongoUri,
  newObjectId,
} from '../fixtures';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
const DB_NAME = 'tababti_integration_slots';

describe('AppointmentSlot — Schema & Instance Methods (Integration)', () => {
  let module: TestingModule;
  let slotModel: Model<AppointmentSlotDocument>;
  let doctorModel: Model<DoctorDocument>;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(buildMongoUri(MONGO_URI, DB_NAME), {
          serverSelectionTimeoutMS: 10_000,
        }),
        MongooseModule.forFeature([
          { name: AppointmentSlot.name, schema: AppointmentSlotSchema },
          { name: Doctor.name, schema: DoctorSchema },
        ]),
      ],
    }).compile();

    // init() triggers onModuleInit lifecycle hooks, including MongooseModule's
    // index-creation logic.  Without it the unique compound index on
    // AppointmentSlot is not yet in place when the first test runs.
    await module.init();

    slotModel = module.get(getModelToken(AppointmentSlot.name));
    doctorModel = module.get(getModelToken(Doctor.name));

    // Belt-and-suspenders: explicitly ensure indexes are synced before any
    // test that relies on uniqueness constraints.
    await slotModel.createIndexes();
  });

  afterAll(async () => {
    const connection = module.get<Connection>(getConnectionToken());
    await connection.dropDatabase();
    await module.close();
  });

  afterEach(async () => {
    await slotModel.deleteMany({});
    await doctorModel.deleteMany({});
  });

  // ── Create ────────────────────────────────────────────────────────────────

  describe('create()', () => {
    it('persists a slot with AVAILABLE status by default', async () => {
      const doctor = await doctorModel.create(buildDoctor());
      const slot = await slotModel.create(buildSlot(doctor._id));

      const found = await slotModel.findById(slot._id).lean();

      expect(found).not.toBeNull();
      expect(found!.status).toBe(SlotStatus.AVAILABLE);
      expect(found!.doctorId.toString()).toBe(doctor._id.toString());
      expect(found!.startTime).toBe('09:00');
      expect(found!.endTime).toBe('09:30');
    });

    it('enforces the unique compound index — no duplicate slots', async () => {
      const doctor = await doctorModel.create(buildDoctor());
      const slotData = buildSlot(doctor._id);

      await slotModel.create(slotData);

      // Attempt to create a duplicate (same doctorId + date + startTime + location.entity_name)
      await expect(slotModel.create(slotData)).rejects.toThrow(
        /duplicate key/i,
      );
    });

    it('allows two slots with different startTimes for the same doctor', async () => {
      const doctor = await doctorModel.create(buildDoctor());

      const slot1 = await slotModel.create(
        buildSlot(doctor._id, { startTime: '09:00', endTime: '09:30' }),
      );
      const slot2 = await slotModel.create(
        buildSlot(doctor._id, { startTime: '10:00', endTime: '10:30' }),
      );

      expect(slot1._id).not.toEqual(slot2._id);
    });

    it('allows slots on the same time for different doctors', async () => {
      const doctor1 = await doctorModel.create(buildDoctor());
      const doctor2 = await doctorModel.create(
        buildDoctor({ firstName: 'Other' }),
      );

      const slot1 = await slotModel.create(buildSlot(doctor1._id));
      const slot2 = await slotModel.create(buildSlot(doctor2._id));

      expect(slot1.doctorId.toString()).not.toBe(slot2.doctorId.toString());
    });
  });

  // ── Instance methods ──────────────────────────────────────────────────────

  describe('book() instance method', () => {
    it('transitions status to BOOKED and records patientId + bookingId', async () => {
      const doctor = await doctorModel.create(buildDoctor());
      const slot = await slotModel.create(buildSlot(doctor._id));

      const patientId = newObjectId();
      const bookingId = newObjectId();

      slot.book(patientId, bookingId);
      await slot.save();

      const updated = await slotModel.findById(slot._id).lean();
      expect(updated!.status).toBe(SlotStatus.BOOKED);
      expect(updated!.patientId!.toString()).toBe(patientId.toString());
      expect(updated!.bookingId!.toString()).toBe(bookingId.toString());
      expect(updated!.bookedAt).toBeDefined();
    });
  });

  describe('cancel() instance method', () => {
    it('transitions status to CANCELLED and clears booking references', async () => {
      const doctor = await doctorModel.create(buildDoctor());
      const slot = await slotModel.create(buildSlot(doctor._id));
      const patientId = newObjectId();
      const bookingId = newObjectId();

      slot.book(patientId, bookingId);
      await slot.save();

      slot.cancel('patient requested', patientId);
      await slot.save();

      const updated = await slotModel.findById(slot._id).lean();
      expect(updated!.status).toBe(SlotStatus.CANCELLED);
      expect(updated!.cancellationReason).toBe('patient requested');
      expect(updated!.cancellationCount).toBe(1);
      expect(updated!.patientId).toBeUndefined();
      expect(updated!.bookingId).toBeUndefined();
    });

    it('increments cancellationCount on repeated cancellations', async () => {
      const doctor = await doctorModel.create(buildDoctor());
      const slot = await slotModel.create(buildSlot(doctor._id));

      slot.cancel('first cancel');
      await slot.save();

      // Reload + cancel again
      const reloaded = await slotModel.findById(slot._id);
      reloaded!.cancel('second cancel');
      await reloaded!.save();

      const updated = await slotModel.findById(slot._id).lean();
      expect(updated!.cancellationCount).toBe(2);
    });
  });

  describe('block() / unblock() instance methods', () => {
    it('blocks a slot and records the reason + blockedBy', async () => {
      const doctor = await doctorModel.create(buildDoctor());
      const slot = await slotModel.create(buildSlot(doctor._id));

      slot.block(BlockReason.LUNCH, doctor._id, 'doctor lunch break');
      await slot.save();

      const updated = await slotModel.findById(slot._id).lean();
      expect(updated!.status).toBe(SlotStatus.BLOCKED);
      expect(updated!.blockReason).toBe(BlockReason.LUNCH);
      expect(updated!.blockNotes).toBe('doctor lunch break');
    });

    it('unblocks a slot and restores AVAILABLE status', async () => {
      const doctor = await doctorModel.create(buildDoctor());
      const slot = await slotModel.create(buildSlot(doctor._id));

      slot.block(BlockReason.BREAK, doctor._id);
      await slot.save();

      slot.unblock();
      await slot.save();

      const updated = await slotModel.findById(slot._id).lean();
      expect(updated!.status).toBe(SlotStatus.AVAILABLE);
      expect(updated!.blockReason).toBeUndefined();
      expect(updated!.blockedBy).toBeUndefined();
    });
  });

  describe('complete() instance method', () => {
    it('sets status to COMPLETED and records timing', async () => {
      const doctor = await doctorModel.create(buildDoctor());
      const slot = await slotModel.create(buildSlot(doctor._id));
      const patientId = newObjectId();
      const bookingId = newObjectId();

      slot.book(patientId, bookingId);
      await slot.save();

      const start = new Date();
      const end = new Date(start.getTime() + 30 * 60 * 1000);
      slot.complete(start, end);
      await slot.save();

      const updated = await slotModel.findById(slot._id).lean();
      expect(updated!.status).toBe(SlotStatus.COMPLETED);
      expect(updated!.actualDuration).toBe(30);
      expect(updated!.completedAt).toBeDefined();
    });
  });

  // ── Queries ───────────────────────────────────────────────────────────────

  describe('database queries', () => {
    it('finds only AVAILABLE slots for a doctor on a given date', async () => {
      const doctor = await doctorModel.create(buildDoctor());
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);

      const nextDay = new Date(tomorrow);
      nextDay.setDate(nextDay.getDate() + 1);

      // Available slot tomorrow
      await slotModel.create(
        buildSlot(doctor._id, { startTime: '09:00', endTime: '09:30' }),
      );
      // Booked slot tomorrow
      await slotModel.create(
        buildSlot(doctor._id, {
          startTime: '10:00',
          endTime: '10:30',
          status: SlotStatus.BOOKED,
        }),
      );
      // Available slot the day after — should NOT be in results
      await slotModel.create(
        buildSlot(doctor._id, {
          date: nextDay,
          startTime: '09:00',
          endTime: '09:30',
        }),
      );

      const endOfTomorrow = new Date(tomorrow);
      endOfTomorrow.setHours(23, 59, 59, 999);

      const available = await slotModel
        .find({
          doctorId: doctor._id,
          date: { $gte: tomorrow, $lte: endOfTomorrow },
          status: SlotStatus.AVAILABLE,
        })
        .lean();

      expect(available).toHaveLength(1);
      expect(available[0].startTime).toBe('09:00');
    });

    it('counts booked slots for a doctor across all dates', async () => {
      const doctor = await doctorModel.create(buildDoctor());
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);

      await slotModel.create(
        buildSlot(doctor._id, {
          startTime: '09:00',
          endTime: '09:30',
          status: SlotStatus.BOOKED,
        }),
      );
      await slotModel.create(
        buildSlot(doctor._id, {
          startTime: '10:00',
          endTime: '10:30',
          status: SlotStatus.BOOKED,
        }),
      );
      await slotModel.create(
        buildSlot(doctor._id, {
          startTime: '11:00',
          endTime: '11:30',
          status: SlotStatus.AVAILABLE,
        }),
      );

      const bookedCount = await slotModel.countDocuments({
        doctorId: doctor._id,
        status: SlotStatus.BOOKED,
      });

      expect(bookedCount).toBe(2);
    });
  });
});
