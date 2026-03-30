import { Test, TestingModule } from '@nestjs/testing';
import { NearbyBookingController } from './nearby-booking.controller';
import { NearbyBookingService } from './nearby-booking.service';

describe('NearbyBookingController', () => {
  let controller: NearbyBookingController;

  const mockService = {
    getTopDoctors: jest.fn(),
    getNextBookingForUser: jest.fn(),
    getNextBookingForDoctor: jest.fn(),
    getAllBookingsForUser: jest.fn(),
    getDoctorPatients: jest.fn(),
    getMyAppointments: jest.fn(),
    searchDoctorPatientsV2: jest.fn(),
    getPatientDetail: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [NearbyBookingController],
      providers: [{ provide: NearbyBookingService, useValue: mockService }],
    }).compile();

    controller = module.get<NearbyBookingController>(NearbyBookingController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getTopDoctors()', () => {
    it('returns top doctors directly', async () => {
      const data = [{ _id: '1', name: 'Dr. Ali' }];
      mockService.getTopDoctors.mockResolvedValue(data);
      const result = await controller.getTopDoctors('1', '10');
      expect(mockService.getTopDoctors).toHaveBeenCalledWith(1, 10);
      expect(result).toEqual(data);
    });
  });

  describe('getNextBookingForUser()', () => {
    it('returns next user booking directly', async () => {
      const data = { bookings: [] };
      mockService.getNextBookingForUser.mockResolvedValue(data);
      const result = await controller.getNextBookingForUser(
        'auth-1',
        undefined,
        '1',
        '10',
      );
      expect(mockService.getNextBookingForUser).toHaveBeenCalledWith(
        'auth-1',
        1,
        10,
        undefined,
      );
      expect(result).toEqual(data);
    });
  });

  describe('getNextBookingForDoctor()', () => {
    it('returns wrapped in ApiResponse', async () => {
      mockService.getNextBookingForDoctor.mockResolvedValue({ bookings: [] });
      const result = await controller.getNextBookingForDoctor(
        'auth-1',
        '1',
        '10',
      );
      expect(result).toHaveProperty('data');
    });
  });

  describe('getAllBookingsForUser()', () => {
    it('returns wrapped in ApiResponse', async () => {
      mockService.getAllBookingsForUser.mockResolvedValue({
        bookings: [],
        total: 0,
      });
      const result = await controller.getAllBookingsForUser(
        'auth-1',
        undefined,
        '1',
        '10',
      );
      expect(result).toHaveProperty('data');
    });
  });

  describe('getDoctorPatients()', () => {
    it('delegates to service and wraps result', async () => {
      mockService.getDoctorPatients.mockResolvedValue({ patients: [] });
      const result = await controller.getDoctorPatients('auth-1', {} as any);
      expect(result).toHaveProperty('data');
    });
  });

  describe('getMyAppointments()', () => {
    it('delegates to service and wraps result', async () => {
      mockService.getMyAppointments.mockResolvedValue({ appointments: [] });
      const result = await controller.getMyAppointments('auth-1', {} as any);
      expect(result).toHaveProperty('data');
    });
  });
});
