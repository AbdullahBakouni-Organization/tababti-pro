import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

const realPatientId = new Types.ObjectId();
const makeReq = () => ({
  user: { entity: { _id: { toString: () => realPatientId.toString() } } },
});

const mockUsersService = {
  validateBooking: jest.fn().mockResolvedValue({ canBook: true }),
  patientCancelBooking: jest.fn().mockResolvedValue({ cancelled: true }),
  getActiveBookingsCount: jest.fn().mockResolvedValue({ totalActive: 2, todayCount: 1, byDoctor: [] }),
  getCancellationsToday: jest.fn().mockResolvedValue({ count: 1, remaining: 4, limit: 5 }),
  updateFCMToken: jest.fn().mockResolvedValue({ tokenUpdated: true }),
  getUserBookings: jest.fn().mockResolvedValue({ bookings: { data: [] }, meta: {} }),
  updateUser: jest.fn().mockResolvedValue({ message: 'User updated', user: {} }),
  getUserProfile: jest.fn().mockResolvedValue({ username: 'Test', phone: '+963912345678' }),
};

describe('UsersController', () => {
  let controller: UsersController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: mockUsersService }],
    }).compile();

    controller = module.get<UsersController>(UsersController);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('cancelBooking() calls service.patientCancelBooking with dto and patientId', async () => {
    const dto = { bookingId: new Types.ObjectId().toString() } as any;
    await controller.cancelBooking(dto, makeReq() as any);
    expect(mockUsersService.patientCancelBooking).toHaveBeenCalledWith(dto, realPatientId.toString());
  });

  it('getActiveBookingsCount() extracts patientId from req', async () => {
    await controller.getActiveBookingsCount(makeReq() as any);
    expect(mockUsersService.getActiveBookingsCount).toHaveBeenCalledWith(realPatientId.toString());
  });

  it('getCancellationsToday() extracts patientId from req', async () => {
    await controller.getCancellationsToday(makeReq() as any);
    expect(mockUsersService.getCancellationsToday).toHaveBeenCalledWith(realPatientId.toString());
  });

  it('updateFCMToken() calls service with userId and token', async () => {
    const dto = { fcmToken: 'new-token' } as any;
    await controller.updateFCMToken(dto, makeReq() as any);
    expect(mockUsersService.updateFCMToken).toHaveBeenCalledWith(realPatientId.toString(), 'new-token');
  });

  it('getMyProfile() returns user profile', async () => {
    await controller.getMyProfile(makeReq() as any);
    expect(mockUsersService.getUserProfile).toHaveBeenCalledWith(realPatientId.toString());
  });
});
