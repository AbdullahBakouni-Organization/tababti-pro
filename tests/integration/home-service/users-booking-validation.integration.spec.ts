/**
 * Integration tests — UsersService booking-validation logic
 *
 * What is tested here:
 *   - validateBooking() reads a real AppointmentSlot and real Booking
 *     documents from MongoDB and enforces business rules.
 *   - getActiveBookingsCount() runs real MongoDB aggregations.
 *   - getCancellationsToday() runs real MongoDB countDocuments queries.
 *
 * What is NOT tested here (belongs in E2E or unit tests):
 *   - Kafka event emission (mocked)
 *   - Cache read/write (mocked — tested separately in redis/ suite)
 *   - MinIO file upload (mocked)
 *   - MongoDB transactions — require replica set; covered by E2E stack
 */

import { Test, TestingModule } from '@nestjs/testing';
import {
  MongooseModule,
  getModelToken,
  InjectConnection,
} from '@nestjs/mongoose';
import { Model, Connection } from 'mongoose';
import mongoose from 'mongoose';

import { UsersService } from '../../../apps/home-service/src/users/users.service';
import {
  Booking,
  BookingDocument,
  BookingSchema,
} from '@app/common/database/schemas/booking.schema';
import {
  AppointmentSlot,
  AppointmentSlotDocument,
  AppointmentSlotSchema,
} from '@app/common/database/schemas/slot.schema';
import {
  User,
  UserDocument,
  UserSchema,
} from '@app/common/database/schemas/user.schema';
import {
  Doctor,
  DoctorDocument,
  DoctorSchema,
} from '@app/common/database/schemas/doctor.schema';
import { KafkaService } from '@app/common/kafka/kafka.service';
import { CacheService } from '@app/common/cache/cache.service';
import { MinioService } from '@app/common/file-storage';
import {
  BookingStatus,
  SlotStatus,
  UserRole,
} from '@app/common/database/schemas/common.enums';

import {
  buildUser,
  buildDoctor,
  buildSlot,
  buildBooking,
  newObjectId,
} from '../fixtures';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
const DB_NAME = 'tababti_integration_users';

describe('UsersService — Booking Validation (Integration)', () => {
  let module: TestingModule;
  let usersService: UsersService;
  let bookingModel: Model<BookingDocument>;
  let slotModel: Model<AppointmentSlotDocument>;
  let userModel: Model<UserDocument>;
  let doctorModel: Model<DoctorDocument>;

  // ── Module bootstrap ──────────────────────────────────────────────────────

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(`${MONGO_URI}/${DB_NAME}`, {
          serverSelectionTimeoutMS: 10_000,
        }),
        MongooseModule.forFeature([
          { name: Booking.name, schema: BookingSchema },
          { name: AppointmentSlot.name, schema: AppointmentSlotSchema },
          { name: User.name, schema: UserSchema },
          { name: Doctor.name, schema: DoctorSchema },
        ]),
      ],
      providers: [
        UsersService,
        {
          provide: KafkaService,
          useValue: { emit: jest.fn() },
        },
        {
          provide: CacheService,
          useValue: {
            get: jest.fn().mockResolvedValue(null),
            set: jest.fn().mockResolvedValue(undefined),
            invalidate: jest.fn().mockResolvedValue(undefined),
            invalidatePattern: jest.fn().mockResolvedValue(undefined),
            del: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: MinioService,
          useValue: {
            deleteFile: jest.fn().mockResolvedValue(undefined),
            uploadFile: jest.fn().mockResolvedValue({ url: 'http://test' }),
          },
        },
      ],
    }).compile();

    await module.init();

    usersService = module.get(UsersService);
    bookingModel = module.get(getModelToken(Booking.name));
    slotModel = module.get(getModelToken(AppointmentSlot.name));
    userModel = module.get(getModelToken(User.name));
    doctorModel = module.get(getModelToken(Doctor.name));
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await module.close();
  });

  afterEach(async () => {
    await bookingModel.deleteMany({});
    await slotModel.deleteMany({});
    await userModel.deleteMany({});
    await doctorModel.deleteMany({});
  });

  // ── validateBooking ───────────────────────────────────────────────────────

  describe('validateBooking()', () => {
    it('returns canBook: true when all rules pass', async () => {
      const doctor = await doctorModel.create(buildDoctor());
      const patient = await userModel.create(buildUser());
      const slot = await slotModel.create(buildSlot(doctor._id));

      const result = await usersService.validateBooking(
        patient._id.toString(),
        doctor._id.toString(),
        slot.date,
        slot._id.toString(),
      );

      expect(result.canBook).toBe(true);
      expect(result.currentBookingsWithDoctor).toBe(0);
      expect(result.currentBookingsToday).toBe(0);
      expect(result.maxBookingsWithDoctor).toBe(1);
      expect(result.maxBookingsPerDay).toBe(3);
    });

    it('rejects an invalid patient ObjectId', async () => {
      const doctorId = newObjectId().toString();
      const slotId = newObjectId().toString();

      await expect(
        usersService.validateBooking('not-an-id', doctorId, new Date(), slotId),
      ).rejects.toThrow('Invalid patient ID');
    });

    it('rejects an invalid doctor ObjectId', async () => {
      const patientId = newObjectId().toString();
      const slotId = newObjectId().toString();

      await expect(
        usersService.validateBooking(
          patientId,
          'not-an-id',
          new Date(),
          slotId,
        ),
      ).rejects.toThrow('Invalid doctor ID');
    });

    it('throws NotFoundException when slot does not exist', async () => {
      const patientId = newObjectId().toString();
      const doctorId = newObjectId().toString();
      const missingSlotId = newObjectId().toString();

      await expect(
        usersService.validateBooking(
          patientId,
          doctorId,
          new Date(),
          missingSlotId,
        ),
      ).rejects.toThrow('Slot not found');
    });

    it('rejects booking a slot with a past date', async () => {
      const doctor = await doctorModel.create(buildDoctor());
      const patient = await userModel.create(buildUser());

      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);

      const slot = await slotModel.create(
        buildSlot(doctor._id, { date: yesterday }),
      );

      const result = await usersService.validateBooking(
        patient._id.toString(),
        doctor._id.toString(),
        yesterday,
        slot._id.toString(),
      );

      expect(result.canBook).toBe(false);
      expect(result.reason).toMatch(/مضى/);
    });

    it('rejects booking a slot that is already BOOKED', async () => {
      const doctor = await doctorModel.create(buildDoctor());
      const patient = await userModel.create(buildUser());
      const slot = await slotModel.create(
        buildSlot(doctor._id, { status: SlotStatus.BOOKED }),
      );

      const result = await usersService.validateBooking(
        patient._id.toString(),
        doctor._id.toString(),
        slot.date,
        slot._id.toString(),
      );

      expect(result.canBook).toBe(false);
      expect(result.reason).toMatch(/غير متاح/);
    });

    it('rejects when patient already has an active booking with the same doctor', async () => {
      const doctor = await doctorModel.create(buildDoctor());
      const patient = await userModel.create(buildUser());

      // Seed an existing PENDING booking between patient and doctor
      const existingSlot = await slotModel.create(
        buildSlot(doctor._id, {
          startTime: '08:00',
          endTime: '08:30',
        }),
      );
      await bookingModel.create(
        buildBooking(patient._id, doctor._id, existingSlot._id, {
          bookingTime: '08:00',
          bookingEndTime: '08:30',
        }),
      );

      // New slot to try to book
      const newSlot = await slotModel.create(buildSlot(doctor._id));

      const result = await usersService.validateBooking(
        patient._id.toString(),
        doctor._id.toString(),
        newSlot.date,
        newSlot._id.toString(),
      );

      expect(result.canBook).toBe(false);
      expect(result.currentBookingsWithDoctor).toBe(1);
      expect(result.reason).toMatch(/حجز نشط/);
    });

    it('rejects when patient has reached the 3-bookings-per-day limit', async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);

      const patient = await userModel.create(buildUser());

      // Create 3 different doctors + slots + bookings for the same day
      const times = ['08:00', '10:00', '12:00'];
      for (const time of times) {
        const doctor = await doctorModel.create(
          buildDoctor({ firstName: `Doc${time}` }),
        );
        const slot = await slotModel.create(
          buildSlot(doctor._id, {
            startTime: time,
            endTime: `${time.split(':')[0].padStart(2, '0')}:30`,
          }),
        );
        await bookingModel.create(
          buildBooking(patient._id, doctor._id, slot._id, {
            bookingDate: tomorrow,
            bookingTime: time,
            bookingEndTime: `${time.split(':')[0].padStart(2, '0')}:30`,
          }),
        );
      }

      // A 4th doctor for the new booking attempt
      const fourthDoctor = await doctorModel.create(
        buildDoctor({ firstName: 'FourthDoc' }),
      );
      const fourthSlot = await slotModel.create(buildSlot(fourthDoctor._id));

      const result = await usersService.validateBooking(
        patient._id.toString(),
        fourthDoctor._id.toString(),
        tomorrow,
        fourthSlot._id.toString(),
      );

      expect(result.canBook).toBe(false);
      expect(result.currentBookingsToday).toBe(3);
      expect(result.reason).toMatch(/اليومية/);
    });
  });

  // ── getActiveBookingsCount ────────────────────────────────────────────────

  describe('getActiveBookingsCount()', () => {
    it('returns zero counts when patient has no bookings', async () => {
      const patient = await userModel.create(buildUser());

      const result = await usersService.getActiveBookingsCount(
        patient._id.toString(),
      );

      expect(result.totalActive).toBe(0);
      expect(result.todayCount).toBe(0);
      expect(result.byDoctor).toEqual([]);
    });

    it('counts active (PENDING + CONFIRMED) bookings correctly', async () => {
      const patient = await userModel.create(buildUser());
      const doctor = await doctorModel.create(buildDoctor());

      const slot1 = await slotModel.create(
        buildSlot(doctor._id, { startTime: '09:00', endTime: '09:30' }),
      );
      const slot2 = await slotModel.create(
        buildSlot(doctor._id, { startTime: '10:00', endTime: '10:30' }),
      );
      const slot3 = await slotModel.create(
        buildSlot(doctor._id, { startTime: '11:00', endTime: '11:30' }),
      );

      await bookingModel.create(
        buildBooking(patient._id, doctor._id, slot1._id, {
          status: BookingStatus.PENDING,
          bookingTime: '09:00',
          bookingEndTime: '09:30',
        }),
      );
      await bookingModel.create(
        buildBooking(patient._id, doctor._id, slot2._id, {
          status: BookingStatus.CONFIRMED,
          bookingTime: '10:00',
          bookingEndTime: '10:30',
        }),
      );
      // Completed booking — should NOT be counted
      await bookingModel.create(
        buildBooking(patient._id, doctor._id, slot3._id, {
          status: BookingStatus.COMPLETED,
          bookingTime: '11:00',
          bookingEndTime: '11:30',
        }),
      );

      const result = await usersService.getActiveBookingsCount(
        patient._id.toString(),
      );

      expect(result.totalActive).toBe(2);
      expect(result.byDoctor).toHaveLength(1);
      expect(result.byDoctor[0].doctorId).toBe(doctor._id.toString());
      expect(result.byDoctor[0].count).toBe(2);
    });

    it('throws BadRequestException for an invalid patient ID', async () => {
      await expect(
        usersService.getActiveBookingsCount('not-an-id'),
      ).rejects.toThrow('Invalid patient ID');
    });
  });

  // ── getCancellationsToday ─────────────────────────────────────────────────

  describe('getCancellationsToday()', () => {
    it('returns the correct cancellation count for today', async () => {
      const patient = await userModel.create(buildUser());
      const doctor = await doctorModel.create(buildDoctor());
      const slot = await slotModel.create(buildSlot(doctor._id));

      const today = new Date();

      await bookingModel.create(
        buildBooking(patient._id, doctor._id, slot._id, {
          status: BookingStatus.CANCELLED_BY_PATIENT,
          cancellation: {
            cancelledBy: UserRole.USER,
            reason: 'test',
            cancelledAt: today,
          },
        }),
      );

      const result = await usersService.getCancellationsToday(
        patient._id.toString(),
      );

      expect(result.count).toBe(1);
      expect(result.limit).toBe(5);
      expect(result.remaining).toBe(4);
    });

    it('does not count cancellations from previous days', async () => {
      const patient = await userModel.create(buildUser());
      const doctor = await doctorModel.create(buildDoctor());
      const slot = await slotModel.create(buildSlot(doctor._id));

      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      await bookingModel.create(
        buildBooking(patient._id, doctor._id, slot._id, {
          status: BookingStatus.CANCELLED_BY_PATIENT,
          cancellation: {
            cancelledBy: UserRole.USER,
            reason: 'test',
            cancelledAt: yesterday,
          },
        }),
      );

      const result = await usersService.getCancellationsToday(
        patient._id.toString(),
      );

      expect(result.count).toBe(0);
      expect(result.remaining).toBe(5);
    });
  });
});
