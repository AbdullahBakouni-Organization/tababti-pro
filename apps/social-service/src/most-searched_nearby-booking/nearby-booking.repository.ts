import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Booking } from '@app/common/database/schemas/booking.schema';
import { BookingStatus } from '@app/common/database/schemas/common.enums';

@Injectable()
export class NearbyBookingRepository {
  constructor(
    @InjectModel(Booking.name) private readonly bookingModel: Model<Booking>,
  ) {}

  async findNextBookingForUser(userId: string, doctorId?: string) {
    const match: Record<string, any> = {
      userId: new Types.ObjectId(userId),
      status: BookingStatus.PENDING,
      bookingDate: { $gte: new Date() },
    };

    if (doctorId) match.doctorId = new Types.ObjectId(doctorId);

    return this.bookingModel
      .findOne(match)
      .sort({ bookingDate: 1, bookingTime: 1 })
      .lean();
  }
}
