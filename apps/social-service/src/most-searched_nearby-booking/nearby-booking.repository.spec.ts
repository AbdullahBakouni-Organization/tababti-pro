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

      const result = await repo.findNextBookingsForDoctor(doctorId, 1, 10);
      expect(mockBookingModel.aggregate).toHaveBeenCalled();
    });
  });

  describe('findNextBookingsForUser()', () => {
    it('returns upcoming bookings for user', async () => {
      const bookings = [{ _id: new Types.ObjectId(), status: 'pending' }];
      mockBookingModel.aggregate.mockResolvedValue([
        { data: bookings, totalCount: [{ count: 1 }] },
      ]);

      const result = await repo.findNextBookingsForUser(patientId);
      expect(mockBookingModel.aggregate).toHaveBeenCalled();
    });

    it('filters by doctorId when provided', async () => {
      mockBookingModel.aggregate.mockResolvedValue([
        { data: [], totalCount: [] },
      ]);

      await repo.findNextBookingsForUser(patientId, doctorId.toString());
      expect(mockBookingModel.aggregate).toHaveBeenCalled();
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

      const result = await repo.findDoctorPatients(doctorId, {} as any);
      expect(mockBookingModel.aggregate).toHaveBeenCalled();
    });
  });

  describe('findMyAppointments()', () => {
    it('returns appointments for doctor', async () => {
      mockBookingModel.aggregate.mockResolvedValue([
        { data: [], totalCount: [] },
      ]);

      const result = await repo.findMyAppointments(doctorId, {} as any);
      expect(mockBookingModel.aggregate).toHaveBeenCalled();
    });
  });
});
