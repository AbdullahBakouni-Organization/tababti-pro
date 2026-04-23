import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { NearbyBookingRepository } from './nearby-booking.repository';
import { Booking } from '@app/common/database/schemas/booking.schema';
import { Doctor } from '@app/common/database/schemas/doctor.schema';
import { User } from '@app/common/database/schemas/user.schema';
import { Center } from '@app/common/database/schemas/center.schema';
import { Hospital } from '@app/common/database/schemas/hospital.schema';

describe('NearbyBookingRepository', () => {
  let repo: NearbyBookingRepository;

  const authAccountId = new Types.ObjectId().toString();
  const doctorId = new Types.ObjectId();
  const patientId = new Types.ObjectId();

  const mockDoctor = { _id: doctorId, firstName: 'Ali', lastName: 'Mahmoud' };
  const mockUser = { _id: patientId, username: 'patient1' };

  const mockBookingModel = {
    aggregate: jest.fn(),
    find: jest.fn(),
    countDocuments: jest.fn(),
    collection: { name: 'bookings' },
  };

  const mockDoctorModel = {
    aggregate: jest.fn(),
    findOne: jest.fn(),
    countDocuments: jest.fn(),
    collection: { name: 'doctors' },
  };

  const mockUserModel = {
    findOne: jest.fn(),
    collection: { name: 'users' },
  };

  const mockCenterModel = {
    collection: { name: 'centers' },
  };

  const mockHospitalModel = {
    collection: { name: 'hospitals' },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NearbyBookingRepository,
        { provide: getModelToken(Booking.name), useValue: mockBookingModel },
        { provide: getModelToken(Doctor.name), useValue: mockDoctorModel },
        { provide: getModelToken(User.name), useValue: mockUserModel },
        { provide: getModelToken(Center.name), useValue: mockCenterModel },
        { provide: getModelToken(Hospital.name), useValue: mockHospitalModel },
      ],
    }).compile();

    repo = module.get<NearbyBookingRepository>(NearbyBookingRepository);
  });

  it('should be defined', () => {
    expect(repo).toBeDefined();
  });

  describe('findUserByAuthAccountId()', () => {
    it('returns user when found', async () => {
      mockUserModel.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(mockUser),
      });

      const result = await repo.findUserByAuthAccountId(authAccountId);
      expect(result).toEqual(mockUser);
    });

    it('returns null when user not found', async () => {
      mockUserModel.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(null),
      });

      const result = await repo.findUserByAuthAccountId(authAccountId);
      expect(result).toBeNull();
    });
  });

  describe('findDoctorByAuthAccountId()', () => {
    it('returns doctor when found', async () => {
      mockDoctorModel.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(mockDoctor),
      });

      const result = await repo.findDoctorByAuthAccountId(authAccountId);
      expect(result).toEqual(mockDoctor);
    });

    it('returns null when doctor not found', async () => {
      mockDoctorModel.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(null),
      });

      const result = await repo.findDoctorByAuthAccountId(authAccountId);
      expect(result).toBeNull();
    });
  });

  describe('findTopDoctors()', () => {
    it('returns top doctors with pagination metadata', async () => {
      const doctors = [{ _id: doctorId, firstName: 'Ali' }];
      mockDoctorModel.aggregate.mockResolvedValue(doctors);
      mockDoctorModel.countDocuments.mockResolvedValue(5);

      const result = await repo.findTopDoctors(1, 10);

      expect(mockDoctorModel.aggregate).toHaveBeenCalled();
      expect(result).toHaveProperty('doctors');
      expect(result).toHaveProperty('meta');
      expect(result.meta.total).toBe(5);
    });
  });

  describe('findNextBookingsForDoctor()', () => {
    it('returns upcoming bookings for doctor', async () => {
      const bookings = [{ _id: new Types.ObjectId(), status: 'pending' }];
      mockBookingModel.aggregate.mockResolvedValue([
        { data: bookings, totalCount: [{ count: 1 }] },
      ]);

      const _result = await repo.findNextBookingsForDoctor(doctorId, 1, 10);
      expect(mockBookingModel.aggregate).toHaveBeenCalled();
    });
  });

  describe('findNextBookingsForUser()', () => {
    it('returns upcoming bookings for user', async () => {
      const bookings = [{ _id: new Types.ObjectId(), status: 'pending' }];
      mockBookingModel.aggregate.mockResolvedValue([
        { data: bookings, totalCount: [{ count: 1 }] },
      ]);

      const _result = await repo.findNextBookingsForUser(patientId);
      expect(mockBookingModel.aggregate).toHaveBeenCalled();
    });

    it('filters by doctorId when provided', async () => {
      mockBookingModel.aggregate.mockResolvedValue([
        { data: [], totalCount: [] },
      ]);

      await repo.findNextBookingsForUser(patientId, doctorId.toString());
      expect(mockBookingModel.aggregate).toHaveBeenCalled();
    });

    describe('Syria-TZ window (regression for same-day bookings dropped)', () => {
      beforeEach(() => {
        jest.useFakeTimers();
        mockBookingModel.aggregate.mockResolvedValue([]);
      });

      afterEach(() => {
        jest.useRealTimers();
      });

      it('builds the same-day clause at UTC-midnight of the Syria date, not local midnight', async () => {
        // 2026-04-23 10:00 UTC = 13:00 Asia/Damascus (UTC+3).
        jest.setSystemTime(new Date('2026-04-23T10:00:00.000Z'));

        await repo.findNextBookingsForUser(patientId);

        const pipeline = mockBookingModel.aggregate.mock.calls[0][0];
        const match = pipeline[0].$match;

        expect(match.$or).toEqual([
          { bookingDate: { $gte: new Date('2026-04-24T00:00:00.000Z') } },
          {
            bookingDate: {
              $gte: new Date('2026-04-23T00:00:00.000Z'),
              $lt: new Date('2026-04-24T00:00:00.000Z'),
            },
            bookingTime: { $gte: '13:00' },
          },
        ]);
      });

      it('rolls to the next Syria date after 21:00 UTC (past midnight in Damascus)', async () => {
        // 2026-04-23 22:00 UTC = 2026-04-24 01:00 Asia/Damascus.
        // If we naively used server-local UTC midnight we would still be
        // on 2026-04-23 and drop bookings already recorded for 2026-04-24.
        jest.setSystemTime(new Date('2026-04-23T22:00:00.000Z'));

        await repo.findNextBookingsForUser(patientId);

        const pipeline = mockBookingModel.aggregate.mock.calls[0][0];
        const match = pipeline[0].$match;

        expect(match.$or[0]).toEqual({
          bookingDate: { $gte: new Date('2026-04-25T00:00:00.000Z') },
        });
        expect(match.$or[1].bookingDate).toEqual({
          $gte: new Date('2026-04-24T00:00:00.000Z'),
          $lt: new Date('2026-04-25T00:00:00.000Z'),
        });
        expect(match.$or[1].bookingTime).toEqual({ $gte: '01:00' });
      });
    });
  });

  describe('findNextBookingsForDoctor() — Syria-TZ window', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      mockBookingModel.aggregate.mockResolvedValue([
        { data: [], totalCount: [] },
      ]);
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('builds the same-day clause at UTC-midnight of the Syria date', async () => {
      jest.setSystemTime(new Date('2026-04-23T10:00:00.000Z'));

      await repo.findNextBookingsForDoctor(doctorId, 1, 10);

      const pipeline = mockBookingModel.aggregate.mock.calls[0][0];
      const match = pipeline[0].$match;

      expect(match.$or).toEqual([
        { bookingDate: { $gte: new Date('2026-04-24T00:00:00.000Z') } },
        {
          bookingDate: {
            $gte: new Date('2026-04-23T00:00:00.000Z'),
            $lt: new Date('2026-04-24T00:00:00.000Z'),
          },
          bookingTime: { $gte: '13:00' },
        },
      ]);
    });
  });

  describe('findAllBookingsForUser()', () => {
    it('returns all bookings for user with pagination', async () => {
      mockBookingModel.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([]),
      });
      mockBookingModel.countDocuments.mockResolvedValue(0);

      const result = await repo.findAllBookingsForUser(patientId);
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('total');
    });
  });

  describe('findDoctorPatients()', () => {
    it('returns doctor patients list', async () => {
      mockBookingModel.aggregate.mockResolvedValue([
        { data: [], totalCount: [] },
      ]);

      const _result = await repo.findDoctorPatients(doctorId, {} as any);
      expect(mockBookingModel.aggregate).toHaveBeenCalled();
    });
  });

  describe('findMyAppointments()', () => {
    it('returns appointments for doctor', async () => {
      mockBookingModel.aggregate.mockResolvedValue([
        { data: [], totalCount: [] },
      ]);

      const _result = await repo.findMyAppointments(doctorId, {} as any);
      expect(mockBookingModel.aggregate).toHaveBeenCalled();
    });
  });
});
