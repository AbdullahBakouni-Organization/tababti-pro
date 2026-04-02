import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { BookingController } from './booking-service.controller';
import { BookingService } from './booking-service.service';

const realPatientId = new Types.ObjectId();

const mockBookingService = {
  createBooking: jest.fn().mockResolvedValue({
    bookingId: new Types.ObjectId().toString(),
    status: 'PENDING',
  }),
};

describe('BookingController', () => {
  let controller: BookingController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BookingController],
      providers: [{ provide: BookingService, useValue: mockBookingService }],
    }).compile();

    controller = module.get<BookingController>(BookingController);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('createBooking() calls bookingService.createBooking with dto and patientId from req', async () => {
    const dto = {
      doctorId: new Types.ObjectId().toString(),
      slotId: new Types.ObjectId().toString(),
    } as any;
    const req = {
      user: { entity: { _id: { toString: () => realPatientId.toString() } } },
    } as any;

    const result = await controller.createBooking(dto, req);

    expect(mockBookingService.createBooking).toHaveBeenCalledWith(
      dto,
      realPatientId.toString(),
    );
    expect(result).toBeDefined();
  });
});
