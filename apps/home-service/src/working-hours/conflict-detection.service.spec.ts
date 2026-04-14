import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { ConflictDetectionService } from './conflict-detection.service';
import { Booking } from '@app/common/database/schemas/booking.schema';
import { createMockModel } from '@app/common/testing';

// Mock getSyriaDate to return a controlled date
const mockToday = new Date('2026-03-29T00:00:00.000Z');
jest.mock('@app/common/utils/get-syria-date', () => ({
  getSyriaDate: jest.fn(() => new Date(mockToday.getTime())),
}));

describe('ConflictDetectionService', () => {
  let service: ConflictDetectionService;
  let bookingModel: ReturnType<typeof createMockModel>;

  const doctorId = new Types.ObjectId().toString();
  const patientId = new Types.ObjectId();
  const bookingId = new Types.ObjectId();
  const slotId = new Types.ObjectId();

  const makeSlot = (overrides: Record<string, unknown> = {}) => ({
    _id: slotId,
    startTime: '10:00',
    endTime: '10:30',
    dayOfWeek: 'monday',
    location: { type: 'clinic', entity_name: 'Clinic A' },
    ...overrides,
  });

  const makePatient = (overrides: Record<string, unknown> = {}) => ({
    _id: patientId,
    username: 'John Doe',
    phone: '+963912345678',
    ...overrides,
  });

  const makeBooking = (overrides: Record<string, unknown> = {}) => ({
    _id: bookingId,
    doctorId: new Types.ObjectId(doctorId),
    patientId: makePatient(),
    slotId: makeSlot(),
    bookingDate: new Date('2026-04-06T00:00:00.000Z'), // future monday
    status: 'pending',
    patientName: null,
    patientAddress: null,
    patientPhone: null,
    ...overrides,
  });

  const makeManualPatientBooking = (overrides: Record<string, unknown> = {}) =>
    makeBooking({
      patientId: null,
      patientName: 'Ahmad Al-Khalidi',
      patientAddress: 'Damascus, Al-Mazzeh',
      patientPhone: '+963912345678',
      ...overrides,
    });

  const makeWorkingHours = (overrides: Record<string, unknown> = {}) => ({
    day: 'monday',
    startTime: '09:00',
    endTime: '17:00',
    isActive: true,
    location: { type: 'clinic', entity_name: 'Clinic A', address: 'Addr' },
    ...overrides,
  });

  beforeEach(async () => {
    bookingModel = createMockModel();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConflictDetectionService,
        {
          provide: getModelToken(Booking.name),
          useValue: bookingModel,
        },
      ],
    }).compile();

    service = module.get<ConflictDetectionService>(ConflictDetectionService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('detectConflicts', () => {
    it('should return empty arrays when there are no bookings', async () => {
      bookingModel._mockQuery.exec.mockResolvedValue([]);

      const result = await service.detectConflicts(doctorId, [
        makeWorkingHours(),
      ]);

      expect(result).toEqual({ todayConflicts: [], futureConflicts: [] });
      expect(bookingModel.find).toHaveBeenCalledWith(
        expect.objectContaining({
          doctorId: expect.any(Types.ObjectId),
          status: { $in: ['pending'] },
        }),
      );
    });

    it('should return empty arrays when bookings fit within new working hours', async () => {
      const booking = makeBooking();
      bookingModel._mockQuery.exec.mockResolvedValue([booking]);

      const result = await service.detectConflicts(doctorId, [
        makeWorkingHours({ startTime: '09:00', endTime: '17:00' }),
      ]);

      expect(result.todayConflicts).toHaveLength(0);
      expect(result.futureConflicts).toHaveLength(0);
    });

    it('should detect future conflict when booking time is outside new working hours', async () => {
      const booking = makeBooking({
        slotId: makeSlot({ startTime: '18:00', endTime: '18:30' }),
      });
      bookingModel._mockQuery.exec.mockResolvedValue([booking]);

      const result = await service.detectConflicts(doctorId, [
        makeWorkingHours({ startTime: '09:00', endTime: '17:00' }),
      ]);

      expect(result.futureConflicts).toHaveLength(1);
      expect(result.futureConflicts[0].reason).toContain(
        'outside new working hours',
      );
      expect(result.futureConflicts[0].bookingId).toBe(bookingId.toString());
      expect(result.futureConflicts[0].patientName).toBe('John Doe');
      expect(result.futureConflicts[0].isToday).toBe(false);
    });

    it('should detect conflict when doctor no longer works on that day/location', async () => {
      const booking = makeBooking({
        slotId: makeSlot({
          location: { type: 'clinic', entity_name: 'Clinic B' },
        }),
      });
      bookingModel._mockQuery.exec.mockResolvedValue([booking]);

      const result = await service.detectConflicts(doctorId, [
        makeWorkingHours({
          location: { type: 'clinic', entity_name: 'Clinic A' },
        }),
      ]);

      expect(result.futureConflicts).toHaveLength(1);
      expect(result.futureConflicts[0].reason).toContain('no longer works on');
      expect(result.futureConflicts[0].reason).toContain('Clinic B');
    });

    it('should classify conflict as todayConflict when booking is today', async () => {
      const booking = makeBooking({
        bookingDate: new Date(mockToday.getTime()), // same day as mockToday
        slotId: makeSlot({ startTime: '18:00', endTime: '18:30' }),
      });
      bookingModel._mockQuery.exec.mockResolvedValue([booking]);

      const result = await service.detectConflicts(doctorId, [
        makeWorkingHours({ startTime: '09:00', endTime: '17:00' }),
      ]);

      expect(result.todayConflicts).toHaveLength(1);
      expect(result.todayConflicts[0].isToday).toBe(true);
      expect(result.futureConflicts).toHaveLength(0);
    });

    it('should skip bookings whose slotId is not a populated object', async () => {
      const booking = makeBooking({ slotId: new Types.ObjectId() });
      bookingModel._mockQuery.exec.mockResolvedValue([booking]);

      const result = await service.detectConflicts(doctorId, [
        makeWorkingHours(),
      ]);

      expect(result.todayConflicts).toHaveLength(0);
      expect(result.futureConflicts).toHaveLength(0);
    });

    it('should skip bookings whose patientId is an unpopulated ObjectId and no patientPhone is set', async () => {
      // Simulates a real patient whose populate() call returned no data
      // (e.g. the user record was deleted).  patientPhone is also absent,
      // so the booking cannot be attributed to anyone and must be skipped.
      const booking = makeBooking({
        patientId: new Types.ObjectId(), // unpopulated ObjectId, not null
        slotId: makeSlot({ startTime: '18:00', endTime: '18:30' }),
        patientPhone: null,
      });
      bookingModel._mockQuery.exec.mockResolvedValue([booking]);

      const result = await service.detectConflicts(doctorId, [
        makeWorkingHours(),
      ]);

      expect(result.todayConflicts).toHaveLength(0);
      expect(result.futureConflicts).toHaveLength(0);
    });

    it('should skip bookings for days not being updated', async () => {
      const booking = makeBooking({
        slotId: makeSlot({
          dayOfWeek: 'tuesday',
          startTime: '18:00',
          endTime: '18:30',
        }),
      });
      bookingModel._mockQuery.exec.mockResolvedValue([booking]);

      // Only updating monday, booking is on tuesday => should be skipped
      const result = await service.detectConflicts(doctorId, [
        makeWorkingHours({ day: 'monday' }),
      ]);

      expect(result.todayConflicts).toHaveLength(0);
      expect(result.futureConflicts).toHaveLength(0);
    });

    it('should handle multiple bookings with mixed conflicts', async () => {
      const noConflictBooking = makeBooking({
        _id: new Types.ObjectId(),
        slotId: makeSlot({ startTime: '10:00', endTime: '10:30' }),
        bookingDate: new Date('2026-04-06T00:00:00.000Z'),
      });
      const conflictBooking = makeBooking({
        _id: new Types.ObjectId(),
        slotId: makeSlot({ startTime: '18:00', endTime: '18:30' }),
        bookingDate: new Date('2026-04-13T00:00:00.000Z'),
      });
      const todayConflictBooking = makeBooking({
        _id: new Types.ObjectId(),
        slotId: makeSlot({ startTime: '07:00', endTime: '07:30' }),
        bookingDate: new Date(mockToday.getTime()),
      });

      bookingModel._mockQuery.exec.mockResolvedValue([
        noConflictBooking,
        conflictBooking,
        todayConflictBooking,
      ]);

      const result = await service.detectConflicts(doctorId, [
        makeWorkingHours({ startTime: '09:00', endTime: '17:00' }),
      ]);

      expect(result.futureConflicts).toHaveLength(1);
      expect(result.todayConflicts).toHaveLength(1);
    });

    it('should include correct location in the conflicted booking', async () => {
      const location = { type: 'hospital', entity_name: 'City Hospital' };
      const booking = makeBooking({
        slotId: makeSlot({
          startTime: '20:00',
          endTime: '20:30',
          location,
        }),
      });
      bookingModel._mockQuery.exec.mockResolvedValue([booking]);

      const result = await service.detectConflicts(doctorId, [
        makeWorkingHours({
          location: { type: 'hospital', entity_name: 'City Hospital' },
          startTime: '09:00',
          endTime: '17:00',
        }),
      ]);

      expect(result.futureConflicts).toHaveLength(1);
      expect(result.futureConflicts[0].location).toEqual(location);
      expect(result.futureConflicts[0].appointmentTime).toBe('20:00');
    });

    it('should handle case-insensitive day matching', async () => {
      const booking = makeBooking({
        slotId: makeSlot({
          dayOfWeek: 'MONDAY',
          startTime: '18:00',
          endTime: '18:30',
        }),
      });
      bookingModel._mockQuery.exec.mockResolvedValue([booking]);

      const result = await service.detectConflicts(doctorId, [
        makeWorkingHours({
          day: 'Monday',
          startTime: '09:00',
          endTime: '17:00',
        }),
      ]);

      expect(result.futureConflicts).toHaveLength(1);
    });

    it('should not conflict when booking exactly matches working hours boundaries', async () => {
      const booking = makeBooking({
        slotId: makeSlot({ startTime: '09:00', endTime: '17:00' }),
      });
      bookingModel._mockQuery.exec.mockResolvedValue([booking]);

      const result = await service.detectConflicts(doctorId, [
        makeWorkingHours({ startTime: '09:00', endTime: '17:00' }),
      ]);

      expect(result.todayConflicts).toHaveLength(0);
      expect(result.futureConflicts).toHaveLength(0);
    });

    it('should detect conflict when booking starts before working hours', async () => {
      const booking = makeBooking({
        slotId: makeSlot({ startTime: '08:30', endTime: '09:30' }),
      });
      bookingModel._mockQuery.exec.mockResolvedValue([booking]);

      const result = await service.detectConflicts(doctorId, [
        makeWorkingHours({ startTime: '09:00', endTime: '17:00' }),
      ]);

      expect(result.futureConflicts).toHaveLength(1);
    });

    it('should detect conflict when booking ends after working hours', async () => {
      const booking = makeBooking({
        slotId: makeSlot({ startTime: '16:30', endTime: '17:30' }),
      });
      bookingModel._mockQuery.exec.mockResolvedValue([booking]);

      const result = await service.detectConflicts(doctorId, [
        makeWorkingHours({ startTime: '09:00', endTime: '17:00' }),
      ]);

      expect(result.futureConflicts).toHaveLength(1);
    });

    it('should use populate for patientId and slotId', async () => {
      bookingModel._mockQuery.exec.mockResolvedValue([]);

      await service.detectConflicts(doctorId, [makeWorkingHours()]);

      expect(bookingModel._mockQuery.populate).toHaveBeenCalledWith(
        'patientId',
        'username phone',
      );
      expect(bookingModel._mockQuery.populate).toHaveBeenCalledWith('slotId');
    });

    it('should include the $or filter for patientId and patientPhone in the query', async () => {
      bookingModel._mockQuery.exec.mockResolvedValue([]);

      await service.detectConflicts(doctorId, [makeWorkingHours()]);

      const findCall = bookingModel.find.mock.calls[0][0];
      expect(findCall.$or).toEqual([
        { patientId: { $ne: null } },
        { patientPhone: { $ne: null } },
      ]);
    });

    // ── Manual-patient booking tests ──────────────────────────────────────────

    it('should detect a future conflict for a manual-patient booking', async () => {
      const booking = makeManualPatientBooking({
        slotId: makeSlot({ startTime: '18:00', endTime: '18:30' }),
      });
      bookingModel._mockQuery.exec.mockResolvedValue([booking]);

      const result = await service.detectConflicts(doctorId, [
        makeWorkingHours({ startTime: '09:00', endTime: '17:00' }),
      ]);

      expect(result.futureConflicts).toHaveLength(1);
      expect(result.futureConflicts[0].patientName).toBe('Ahmad Al-Khalidi');
      expect(result.futureConflicts[0].patientContact).toBe('+963912345678');
      // patientId is the phone used as surrogate identifier
      expect(result.futureConflicts[0].patientId).toBe('+963912345678');
      expect(result.futureConflicts[0].isToday).toBe(false);
    });

    it('should classify a manual-patient booking as todayConflict when date is today', async () => {
      const booking = makeManualPatientBooking({
        bookingDate: new Date(mockToday.getTime()),
        slotId: makeSlot({ startTime: '18:00', endTime: '18:30' }),
      });
      bookingModel._mockQuery.exec.mockResolvedValue([booking]);

      const result = await service.detectConflicts(doctorId, [
        makeWorkingHours({ startTime: '09:00', endTime: '17:00' }),
      ]);

      expect(result.todayConflicts).toHaveLength(1);
      expect(result.todayConflicts[0].isToday).toBe(true);
      expect(result.futureConflicts).toHaveLength(0);
    });

    it('should not include a manual-patient booking that fits within new working hours', async () => {
      const booking = makeManualPatientBooking({
        slotId: makeSlot({ startTime: '10:00', endTime: '10:30' }),
      });
      bookingModel._mockQuery.exec.mockResolvedValue([booking]);

      const result = await service.detectConflicts(doctorId, [
        makeWorkingHours({ startTime: '09:00', endTime: '17:00' }),
      ]);

      expect(result.todayConflicts).toHaveLength(0);
      expect(result.futureConflicts).toHaveLength(0);
    });

    it('should skip a booking with null patientId and null patientPhone', async () => {
      // Booking that has neither a real patient nor manual-patient fields — invalid state.
      const booking = makeBooking({
        patientId: null,
        patientPhone: null,
        slotId: makeSlot({ startTime: '18:00', endTime: '18:30' }),
      });
      bookingModel._mockQuery.exec.mockResolvedValue([booking]);

      const result = await service.detectConflicts(doctorId, [
        makeWorkingHours({ startTime: '09:00', endTime: '17:00' }),
      ]);

      expect(result.todayConflicts).toHaveLength(0);
      expect(result.futureConflicts).toHaveLength(0);
    });

    it('should handle a mix of regular and manual-patient bookings', async () => {
      const regularConflict = makeBooking({
        _id: new Types.ObjectId(),
        slotId: makeSlot({ startTime: '18:00', endTime: '18:30' }),
      });
      const manualConflict = makeManualPatientBooking({
        _id: new Types.ObjectId(),
        slotId: makeSlot({ startTime: '19:00', endTime: '19:30' }),
      });
      const noConflict = makeBooking({
        _id: new Types.ObjectId(),
        slotId: makeSlot({ startTime: '10:00', endTime: '10:30' }),
      });

      bookingModel._mockQuery.exec.mockResolvedValue([
        regularConflict,
        manualConflict,
        noConflict,
      ]);

      const result = await service.detectConflicts(doctorId, [
        makeWorkingHours({ startTime: '09:00', endTime: '17:00' }),
      ]);

      expect(result.futureConflicts).toHaveLength(2);
      const names = result.futureConflicts.map((c) => c.patientName);
      expect(names).toContain('John Doe');
      expect(names).toContain('Ahmad Al-Khalidi');
    });

    it('should check bookings within 365 days from today', async () => {
      bookingModel._mockQuery.exec.mockResolvedValue([]);

      await service.detectConflicts(doctorId, [makeWorkingHours()]);

      const findCall = bookingModel.find.mock.calls[0][0];
      expect(findCall.bookingDate.$gte).toEqual(expect.any(Date));
      expect(findCall.bookingDate.$lte).toEqual(expect.any(Date));

      const diffMs =
        findCall.bookingDate.$lte.getTime() -
        findCall.bookingDate.$gte.getTime();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);
      expect(diffDays).toBe(365);
    });

    it('should match booking against multiple working hour slots for same day', async () => {
      // Booking at 14:00-14:30, two working hour blocks
      const booking = makeBooking({
        slotId: makeSlot({ startTime: '14:00', endTime: '14:30' }),
      });
      bookingModel._mockQuery.exec.mockResolvedValue([booking]);

      const result = await service.detectConflicts(doctorId, [
        makeWorkingHours({
          day: 'monday',
          startTime: '09:00',
          endTime: '12:00',
          location: { type: 'clinic', entity_name: 'Clinic A' },
        }),
        makeWorkingHours({
          day: 'monday',
          startTime: '13:00',
          endTime: '17:00',
          location: { type: 'clinic', entity_name: 'Clinic A' },
        }),
      ]);

      // 14:00-14:30 fits within 13:00-17:00 block
      expect(result.todayConflicts).toHaveLength(0);
      expect(result.futureConflicts).toHaveLength(0);
    });
  });

  describe('getUniquePatientCount', () => {
    it('should return 0 for empty array', () => {
      const count = service.getUniquePatientCount([]);
      expect(count).toBe(0);
    });

    it('should return correct count for unique patients', () => {
      const p1 = new Types.ObjectId().toString();
      const p2 = new Types.ObjectId().toString();
      const conflicts = [
        { patientId: p1 } as any,
        { patientId: p2 } as any,
        { patientId: p1 } as any, // duplicate
      ];

      const count = service.getUniquePatientCount(conflicts);
      expect(count).toBe(2);
    });

    it('should return 1 when all conflicts are from same patient', () => {
      const p1 = new Types.ObjectId().toString();
      const conflicts = [{ patientId: p1 } as any, { patientId: p1 } as any];

      const count = service.getUniquePatientCount(conflicts);
      expect(count).toBe(1);
    });

    it('should count each distinct patient exactly once', () => {
      const ids = Array.from({ length: 5 }, () =>
        new Types.ObjectId().toString(),
      );
      const conflicts = ids.map((id) => ({ patientId: id }) as any);

      const count = service.getUniquePatientCount(conflicts);
      expect(count).toBe(5);
    });

    it('should count distinct manual patients by phone (used as surrogate patientId)', () => {
      // Two manual patients with different phones → count = 2
      const conflicts = [
        { patientId: '+963912345678' } as any,
        { patientId: '+963912345679' } as any,
        { patientId: '+963912345678' } as any, // same phone, duplicate
      ];

      const count = service.getUniquePatientCount(conflicts);
      expect(count).toBe(2);
    });

    it('should count regular and manual patients together without collision', () => {
      const dbPatientId = new Types.ObjectId().toString();
      const conflicts = [
        { patientId: dbPatientId } as any, // real patient
        { patientId: '+963912345678' } as any, // manual patient A
        { patientId: '+963912345679' } as any, // manual patient B
        { patientId: dbPatientId } as any, // duplicate real patient
      ];

      const count = service.getUniquePatientCount(conflicts);
      expect(count).toBe(3);
    });
  });
});
