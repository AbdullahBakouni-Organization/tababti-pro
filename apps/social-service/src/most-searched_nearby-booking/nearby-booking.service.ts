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
import { BookingStatus, UserRole } from '@app/common/database/schemas/common.enums';

@Injectable()
export class NearbyBookingService {
  constructor(
    @InjectModel(Booking.name) private readonly bookingModel: Model<Booking>,
    @InjectModel(Doctor.name) private readonly doctorModel: Model<Doctor>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
  ) { }

  // ================= GET NEXT BOOKING FOR USER =================
  async getNextBookingForUser(authAccountId: string, doctorId?: string) {
    try {
      if (!Types.ObjectId.isValid(authAccountId)) {
        throw new BadRequestException('common.VALIDATION_ERROR');
      }

      const user = await this.userModel.findOne({
        authAccountId: new Types.ObjectId(authAccountId),
      });

      if (!user) {
        throw new NotFoundException('user.NOT_FOUND');
      }

      const today = new Date();

      const query: any = {
        userId: user._id,
        status: BookingStatus.PENDING,
        bookingDate: { $gte: today },
      };

      if (doctorId) {
        if (!Types.ObjectId.isValid(doctorId)) {
          throw new BadRequestException('common.VALIDATION_ERROR');
        }
        query.doctorId = new Types.ObjectId(doctorId);
      }

      const booking = await this.bookingModel
        .findOne(query)
        .sort({ bookingDate: 1, bookingTime: 1 })
        .populate('doctorId', 'firstName lastName middleName image');

      if (!booking) {
        throw new NotFoundException('booking.NOT_FOUND_USER');
      }

      return booking;
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }

      console.error('❌ getNextBookingForUser error:', error);
      throw new InternalServerErrorException('common.ERROR');
    }
  }

  // ================= GET NEXT BOOKING FOR DOCTOR =================
  async getNextBookingForDoctor(authAccountId: string) {
    try {
      if (!Types.ObjectId.isValid(authAccountId)) {
        throw new BadRequestException('common.VALIDATION_ERROR');
      }

      const doctor = await this.doctorModel.findOne({
        authAccountId: new Types.ObjectId(authAccountId),
      });

      if (!doctor) {
        throw new NotFoundException('doctor.NOT_FOUND');
      }

      const today = new Date();

      const booking = await this.bookingModel
        .findOne({
          doctorId: doctor._id,
          status: BookingStatus.PENDING,
          bookingDate: { $gte: today },
        })
        .sort({ bookingDate: 1, bookingTime: 1 })
        .populate('userId', 'username phone image');

      if (!booking) {
        throw new NotFoundException('booking.NOT_FOUND_DOCTOR');
      }

      return booking;
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }

      console.error('❌ getNextBookingForDoctor error:', error);
      throw new InternalServerErrorException('common.ERROR');
    }
  }

  // ================= GET TOP DOCTORS =================
  async getTopDoctors(limit: number = 10) {
    try {
      if (!limit || limit <= 0) {
        throw new BadRequestException('common.VALIDATION_ERROR');
      }

      return await this.doctorModel
        .find()
        .sort({ searchCount: -1 })
        .limit(limit)
        .select('firstName lastName middleName image searchCount');
    } catch (error) {
      console.error('❌ getTopDoctors error:', error);
      throw new InternalServerErrorException('common.ERROR');
    }
  }

  // ================= GET ALL BOOKINGS =================
  async getAllBookingsForUser(authAccountId: string, status?: string) {
    try {
      if (!Types.ObjectId.isValid(authAccountId)) {
        throw new BadRequestException('common.VALIDATION_ERROR');
      }

      const user = await this.userModel.findOne({
        authAccountId: new Types.ObjectId(authAccountId),
      });

      if (!user) {
        throw new NotFoundException('user.NOT_FOUND');
      }

      const query: any = { userId: user._id };

      if (status) {
        const validStatuses = Object.values(BookingStatus);

        if (!validStatuses.includes(status as BookingStatus)) {
          throw new BadRequestException('booking.INVALID_STATUS');
        }

        query.status = status;
      }

      return await this.bookingModel
        .find(query)
        .sort({ bookingDate: -1, bookingTime: -1 })
        .populate('doctorId', 'firstName lastName middleName image');
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }

      console.error('❌ getAllBookingsForUser error:', error);
      throw new InternalServerErrorException('common.ERROR');
    }
  }

  // ================= GET DOCTOR PATIENTS =================
  async getDoctorPatients(authAccountId: string, filters: any) {
    try {
      if (!Types.ObjectId.isValid(authAccountId)) {
        throw new BadRequestException('common.VALIDATION_ERROR');
      }

      const doctor = await this.doctorModel.findOne({
        authAccountId: new Types.ObjectId(authAccountId),
      });

      if (!doctor) {
        throw new NotFoundException('doctor.NOT_FOUND');
      }

      const page = Math.max(Number(filters.page) || 1, 1);
      const limit = Math.max(Number(filters.limit) || 10, 1);
      const skip = (page - 1) * limit;

      const matchStage: any = {
        doctorId: doctor._id,
        $or: [
          { status: BookingStatus.COMPLETED },
          { completedAt: { $ne: null } },
        ],
      };

      if (filters.fromDate || filters.toDate) {
        matchStage.bookingDate = {};
        if (filters.fromDate) matchStage.bookingDate.$gte = new Date(filters.fromDate);
        if (filters.toDate) matchStage.bookingDate.$lte = new Date(filters.toDate);
      }

      const pipeline: any[] = [
        { $match: matchStage },

        {
          $lookup: {
            from: this.userModel.collection.name,
            localField: 'userId',
            foreignField: '_id',
            as: 'patient',
          },
        },
        { $unwind: '$patient' },
      ];

      if (filters.search) {
        pipeline.push({
          $match: {
            $or: [
              { 'patient.username': { $regex: filters.search, $options: 'i' } },
              { 'patient.phone': { $regex: filters.search, $options: 'i' } },
            ],
          },
        });
      }

      pipeline.push(
        {
          $group: {
            _id: '$patient._id',
            username: { $first: '$patient.username' },
            phone: { $first: '$patient.phone' },
            image: { $first: '$patient.image' },
            totalVisits: { $sum: 1 },
            lastVisit: { $max: '$bookingDate' },
          },
        },
        { $sort: { lastVisit: -1 } },
        {
          $facet: {
            data: [{ $skip: skip }, { $limit: limit }],
            totalCount: [{ $count: 'count' }],
          },
        },
      );

      const result = await this.bookingModel.aggregate(pipeline);

      const data = result[0]?.data || [];
      const total = result[0]?.totalCount?.[0]?.count || 0;

      return {
        patients: data,
        total,
        page,
        limit,
      };
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }

      console.error('❌ getDoctorPatients error:', error);
      throw new InternalServerErrorException('common.ERROR');
    }
  }

  // ================= GET MY APPOINTMENTS =================
  async getMyAppointments(authAccountId: string, filters?: any) {
    try {
      if (!Types.ObjectId.isValid(authAccountId)) {
        throw new BadRequestException('common.VALIDATION_ERROR');
      }

      const doctor = await this.doctorModel.findOne({
        authAccountId: new Types.ObjectId(authAccountId),
      });

      if (!doctor) {
        throw new NotFoundException('doctor.NOT_FOUND');
      }

      const page = Math.max(Number(filters?.page) || 1, 1);
      const limit = Math.max(Number(filters?.limit) || 10, 1);
      const skip = (page - 1) * limit;

      const matchStage: any = {
        doctorId: doctor._id,
        status: { $in: [BookingStatus.PENDING, BookingStatus.CONFIRMED, BookingStatus.COMPLETED] },
      };

      if (filters?.fromDate || filters?.toDate) {
        matchStage.bookingDate = {};
        if (filters.fromDate) matchStage.bookingDate.$gte = new Date(filters.fromDate);
        if (filters.toDate) matchStage.bookingDate.$lte = new Date(filters.toDate);
      }

      const pipeline: any[] = [
        { $match: matchStage },
        {
          $lookup: {
            from: this.userModel.collection.name,
            localField: 'userId',
            foreignField: '_id',
            as: 'patient',
          },
        },
        { $unwind: '$patient' },
      ];

      if (filters?.search) {
        pipeline.push({
          $match: {
            $or: [
              { 'patient.username': { $regex: filters.search, $options: 'i' } },
              { 'patient.phone': { $regex: filters.search, $options: 'i' } },
            ],
          },
        });
      }

      pipeline.push(
        {
          $sort: { bookingDate: -1, bookingTime: -1 },
        },
        {
          $facet: {
            data: [{ $skip: skip }, { $limit: limit }],
            totalCount: [{ $count: 'count' }],
          },
        },
      );

      const result = await this.bookingModel.aggregate(pipeline);

      return {
        appointments: result[0]?.data || [],
        total: result[0]?.totalCount?.[0]?.count || 0,
        page,
        limit,
      };
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      console.error('❌ getMyAppointments error:', error);
      throw new InternalServerErrorException('common.ERROR');
    }
  }
}