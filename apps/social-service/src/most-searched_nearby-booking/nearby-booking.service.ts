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
import { BookingStatus } from '@app/common/database/schemas/common.enums';
import { GetDoctorPatientsDto } from './dto/get-doctor-patients.dto';
import { GetMyAppointmentsDto } from './dto/get-my-appointments.dto';

@Injectable()
export class NearbyBookingService {
  constructor(
    @InjectModel(Booking.name) private readonly bookingModel: Model<Booking>,
    @InjectModel(Doctor.name) private readonly doctorModel: Model<Doctor>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
  ) {}

  // ── Get Next Booking For User ─────────────────────────────────────────────

  async getNextBookingForUser(authAccountId: string, doctorId?: string) {
    this.assertValidObjectId(authAccountId, 'common.VALIDATION_ERROR');

    const user = await this.userModel
      .findOne({ authAccountId: new Types.ObjectId(authAccountId) })
      .lean();
    if (!user) throw new NotFoundException('user.NOT_FOUND');

    const query: Record<string, any> = {
      userId: user._id,
      status: BookingStatus.PENDING,
      bookingDate: { $gte: new Date() },
    };

    if (doctorId) {
      this.assertValidObjectId(doctorId, 'common.VALIDATION_ERROR');
      query.doctorId = new Types.ObjectId(doctorId);
    }

    const booking = await this.bookingModel
      .findOne(query)
      .sort({ bookingDate: 1, bookingTime: 1 })
      .populate('doctorId', 'firstName lastName middleName image')
      .lean();

    if (!booking) throw new NotFoundException('booking.NOT_FOUND_USER');

    return booking;
  }

  // ── Get Next Booking For Doctor ───────────────────────────────────────────

  async getNextBookingForDoctor(authAccountId: string) {
    this.assertValidObjectId(authAccountId, 'common.VALIDATION_ERROR');

    const doctor = await this.doctorModel
      .findOne({ authAccountId: new Types.ObjectId(authAccountId) })
      .lean();
    if (!doctor) throw new NotFoundException('doctor.NOT_FOUND');

    const booking = await this.bookingModel
      .findOne({
        doctorId: doctor._id,
        status: BookingStatus.PENDING,
        bookingDate: { $gte: new Date() },
      })
      .sort({ bookingDate: 1, bookingTime: 1 })
      .populate('userId', 'username phone image')
      .lean();

    if (!booking) throw new NotFoundException('booking.NOT_FOUND_DOCTOR');

    return booking;
  }

  // ── Get Top Doctors ───────────────────────────────────────────────────────

  async getTopDoctors(limit = 10) {
    const safeLimit = Math.min(Math.max(limit, 1), 50);

    return this.doctorModel
      .find()
      .sort({ searchCount: -1 })
      .limit(safeLimit)
      .select('firstName lastName middleName image searchCount')
      .lean();
  }

  // ── Get All Bookings For User ─────────────────────────────────────────────

  async getAllBookingsForUser(authAccountId: string, status?: string) {
    this.assertValidObjectId(authAccountId, 'common.VALIDATION_ERROR');

    const user = await this.userModel
      .findOne({ authAccountId: new Types.ObjectId(authAccountId) })
      .lean();
    if (!user) throw new NotFoundException('user.NOT_FOUND');

    const query: Record<string, any> = { userId: user._id };

    if (status) {
      if (!Object.values(BookingStatus).includes(status as BookingStatus)) {
        throw new BadRequestException('booking.INVALID_STATUS');
      }
      query.status = status;
    }

    return this.bookingModel
      .find(query)
      .sort({ bookingDate: -1, bookingTime: -1 })
      .populate('doctorId', 'firstName lastName middleName image')
      .lean();
  }

  // ── Get Doctor Patients ───────────────────────────────────────────────────

  async getDoctorPatients(
    authAccountId: string,
    filters: GetDoctorPatientsDto,
  ) {
    this.assertValidObjectId(authAccountId, 'common.VALIDATION_ERROR');

    const doctor = await this.doctorModel
      .findOne({ authAccountId: new Types.ObjectId(authAccountId) })
      .lean();
    if (!doctor) throw new NotFoundException('doctor.NOT_FOUND');

    const { page, limit, skip } = this.paginate(filters.page, filters.limit);

    const matchStage: Record<string, any> = {
      doctorId: doctor._id,
      $or: [
        { status: BookingStatus.COMPLETED },
        { completedAt: { $ne: null } },
      ],
    };

    if (filters.fromDate || filters.toDate) {
      matchStage.bookingDate = {};
      if (filters.fromDate)
        matchStage.bookingDate.$gte = new Date(filters.fromDate);
      if (filters.toDate)
        matchStage.bookingDate.$lte = new Date(filters.toDate);
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

    return {
      patients: result[0]?.data ?? [],
      total: result[0]?.totalCount?.[0]?.count ?? 0,
      page,
      limit,
      totalPages: Math.ceil((result[0]?.totalCount?.[0]?.count ?? 0) / limit),
    };
  }

  // ── Get My Appointments (Doctor) ──────────────────────────────────────────

  async getMyAppointments(
    authAccountId: string,
    filters: GetMyAppointmentsDto,
  ) {
    this.assertValidObjectId(authAccountId, 'common.VALIDATION_ERROR');

    const doctor = await this.doctorModel
      .findOne({ authAccountId: new Types.ObjectId(authAccountId) })
      .lean();
    if (!doctor) throw new NotFoundException('doctor.NOT_FOUND');

    const { page, limit, skip } = this.paginate(filters.page, filters.limit);

    const matchStage: Record<string, any> = {
      doctorId: doctor._id,
      status: {
        $in: [
          BookingStatus.PENDING,
          BookingStatus.CONFIRMED,
          BookingStatus.COMPLETED,
        ],
      },
    };

    if (filters.fromDate || filters.toDate) {
      matchStage.bookingDate = {};
      if (filters.fromDate)
        matchStage.bookingDate.$gte = new Date(filters.fromDate);
      if (filters.toDate)
        matchStage.bookingDate.$lte = new Date(filters.toDate);
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
      { $sort: { bookingDate: -1, bookingTime: -1 } },
      {
        $facet: {
          data: [{ $skip: skip }, { $limit: limit }],
          totalCount: [{ $count: 'count' }],
        },
      },
    );

    const result = await this.bookingModel.aggregate(pipeline);
    const total = result[0]?.totalCount?.[0]?.count ?? 0;

    return {
      appointments: result[0]?.data ?? [],
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // ── Private Helpers ───────────────────────────────────────────────────────

  private assertValidObjectId(id: string, messageKey: string): void {
    if (!Types.ObjectId.isValid(id)) throw new BadRequestException(messageKey);
  }

  private paginate(pageStr?: string, limitStr?: string) {
    const page = Math.max(Number(pageStr) || 1, 1);
    const limit = Math.min(Math.max(Number(limitStr) || 10, 1), 50);
    const skip = (page - 1) * limit;
    return { page, limit, skip };
  }
}
