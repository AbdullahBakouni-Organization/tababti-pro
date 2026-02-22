import {
  Injectable,
  NotFoundException,
  InternalServerErrorException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Booking } from '@app/common/database/schemas/booking.schema';
import { Doctor } from '@app/common/database/schemas/doctor.schema';
import { User } from '@app/common/database/schemas/user.schema';

@Injectable()
export class NearbyBookingService {
  constructor(
    @InjectModel(Booking.name) private readonly bookingModel: Model<Booking>,
    @InjectModel(Doctor.name) private readonly doctorModel: Model<Doctor>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
  ) {}
//we have problem in this function
  async getNextBookingForUser(authAccountId: string, doctorId?: string) {
    try {
      const user = await this.userModel.findOne({
        authAccountId: new Types.ObjectId(authAccountId),
      });
      if (!user) throw new NotFoundException('User not found');

      const today = new Date();

      const query: any = {
        userId: user._id,
        status: 'pending',
        bookingDate: { $gte: today },
      };

      if (doctorId) {
        query.doctorId = new Types.ObjectId(doctorId);
      }

      const booking = await this.bookingModel
        .findOne(query)
        .sort({ bookingDate: 1, bookingTime: 1 })
        .populate('doctorId', 'firstName lastName middleName image');

      if (!booking)
        throw new NotFoundException('No upcoming booking found for user');

      return booking;
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      )
        throw error;

      console.error('❌ Unexpected error in getNextBookingForUser:', error);
      throw new InternalServerErrorException('common.ERROR');
    }
  }

  async getNextBookingForDoctor(authAccountId: string) {
    try {
      const doctor = await this.doctorModel.findOne({
        authAccountId: new Types.ObjectId(authAccountId),
      });
      if (!doctor) throw new NotFoundException('Doctor not found');

      const today = new Date();

      const booking = await this.bookingModel
        .findOne({
          doctorId: doctor._id,
          status: 'pending',
          bookingDate: { $gte: today },
        })
        .sort({ bookingDate: 1, bookingTime: 1 })
        .populate('userId', 'username phone image');

      if (!booking)
        throw new NotFoundException('No upcoming booking found for doctor');

      return booking;
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      )
        throw error;

      console.error('❌ Unexpected error in getNextBookingForDoctor:', error);
      throw new InternalServerErrorException('common.ERROR');
    }
  }

  async getTopDoctors(limit: number = 10) {
    try {
      if (limit <= 0) throw new BadRequestException('limit.INVALID');

      const doctors = await this.doctorModel
        .find()
        .sort({ searchCount: -1 })
        .limit(limit)
        .select('firstName lastName middleName image searchCount');

      return doctors;
    } catch (error) {
      console.error('❌ Unexpected error in getTopDoctors:', error);
      throw new InternalServerErrorException('common.ERROR');
    }
  }
}
