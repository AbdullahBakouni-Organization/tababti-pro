/**
 * Test fixture factories.
 * Each factory returns a plain object (not a Mongoose document) with all
 * required fields populated using deterministic defaults that can be
 * overridden by callers.
 */
import { Types } from 'mongoose';

// ─── URI helper ───────────────────────────────────────────────────────────────
// Re-exported from setup/mongo-uri.ts which has no external imports and is
// therefore safe to use from globalSetup / globalTeardown as well.
export { buildMongoUri } from '../setup/mongo-uri';
import {
  ApprovalStatus,
  BookingStatus,
  City,
  Days,
  Gender,
  SlotStatus,
  UserRole,
  WorkigEntity,
} from '@app/common/database/schemas/common.enums';

// ─── Shared IDs ──────────────────────────────────────────────────────────────

export function newObjectId() {
  return new Types.ObjectId();
}

// ─── User ─────────────────────────────────────────────────────────────────────

export function buildUser(overrides: Record<string, unknown> = {}) {
  return {
    authAccountId: newObjectId(),
    username: 'testuser',
    phone: '+963912345678',
    gender: Gender.MALE,
    city: City.Damascus,
    DataofBirth: new Date('1990-01-01'),
    status: ApprovalStatus.ACTIVE,
    ...overrides,
  };
}

// ─── Doctor ───────────────────────────────────────────────────────────────────

export function buildDoctor(overrides: Record<string, unknown> = {}) {
  return {
    authAccountId: newObjectId(),
    firstName: 'Ahmad',
    lastName: 'Hassan',
    middleName: 'Ali',
    password: 'Test@12345',
    phones: [{ whatsup: ['+963912345678'], clinic: [], normal: [] }],
    status: ApprovalStatus.APPROVED,
    city: City.Damascus,
    subcity: 'المزة',
    publicSpecialization: 'طب_بشري',
    privateSpecialization: 'طب_عام',
    gender: Gender.MALE,
    inspectionDuration: 30,
    inspectionPrice: 5000,
    workingHoursVersion: 1,
    ...overrides,
  };
}

// ─── AppointmentSlot ──────────────────────────────────────────────────────────

export function buildSlot(
  doctorId: Types.ObjectId,
  overrides: Record<string, unknown> = {},
) {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);

  return {
    doctorId,
    status: SlotStatus.AVAILABLE,
    date: tomorrow,
    startTime: '09:00',
    endTime: '09:30',
    dayOfWeek: Days.MONDAY,
    duration: 30,
    workingHoursVersion: 1,
    location: {
      type: WorkigEntity.CLINIC,
      entity_name: 'Test Clinic',
      address: 'Test Address',
    },
    price: 5000,
    ...overrides,
  };
}

// ─── Booking ──────────────────────────────────────────────────────────────────

export function buildBooking(
  patientId: Types.ObjectId,
  doctorId: Types.ObjectId,
  slotId: Types.ObjectId,
  overrides: Record<string, unknown> = {},
) {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);

  return {
    patientId,
    doctorId,
    slotId,
    status: BookingStatus.PENDING,
    bookingDate: tomorrow,
    bookingTime: '09:00',
    bookingEndTime: '09:30',
    location: {
      type: WorkigEntity.CLINIC,
      entity_name: 'Test Clinic',
      address: 'Test Address',
    },
    price: 5000,
    createdBy: UserRole.USER,
    workingHoursVersion: 1,
    ...overrides,
  };
}
