import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { Booking } from '@app/common/database/schemas/booking.schema';
import { Doctor } from '@app/common/database/schemas/doctor.schema';
import { User } from '@app/common/database/schemas/user.schema';
import { BookingStatus } from '@app/common/database/schemas/common.enums';

import { GetDoctorPatientsDto } from './dto/get-doctor-patients.dto';
import { GetMyAppointmentsDto } from './dto/get-my-appointments.dto';
import { SearchPatientsDto } from './dto/search-patients.dto';

@Injectable()
export class NearbyBookingRepository {
  constructor(
    @InjectModel(Booking.name) private readonly bookingModel: Model<Booking>,
    @InjectModel(Doctor.name) private readonly doctorModel: Model<Doctor>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
  ) {}

  // ── Find User by authAccountId ────────────────────────────────────────────

  async findUserByAuthAccountId(authAccountId: string) {
    return this.userModel
      .findOne({ authAccountId: new Types.ObjectId(authAccountId) })
      .lean();
  }

  // ── Find Doctor by authAccountId ──────────────────────────────────────────

  async findDoctorByAuthAccountId(authAccountId: string) {
    return this.doctorModel
      .findOne({ authAccountId: new Types.ObjectId(authAccountId) })
      .lean();
  }

  // ── Find Next Booking For Doctor ──────────────────────────────────────────
  // Returns: userId populated { _id, username, phone }, doctorId as plain id

  async findNextBookingForDoctor(doctorId: Types.ObjectId) {
    const result = await this.bookingModel.aggregate([
      {
        $match: {
          doctorId,
          status: BookingStatus.PENDING,
          bookingDate: { $gte: new Date() },
        },
      },
      { $sort: { bookingDate: 1 } },
      { $limit: 1 },
      {
        $lookup: {
          from: this.userModel.collection.name,
          localField: 'patientId',
          foreignField: '_id',
          as: 'userData',
        },
      },
      { $unwind: { path: '$userData', preserveNullAndEmptyArrays: true } },
      {
        $addFields: {
          userId: {
            _id: '$userData._id',
            username: '$userData.username',
            phone: '$userData.phone',
          },
        },
      },
      {
        $project: {
          patientId: 0,
          userData: 0,
          workingHoursVersion: 0,
          cancellation: 0,
        },
      },
    ]);

    return result[0] ?? null;
  }

  // ── Find Next Booking For User ────────────────────────────────────────────
  // Returns: doctorId populated { _id, firstName, lastName, middleName, image },
  //          userId as plain id

  async findNextBookingForUser(patientId: Types.ObjectId, doctorId?: string) {
    const match: Record<string, any> = {
      patientId,
      status: BookingStatus.PENDING,
      bookingDate: { $gte: new Date() },
    };

    if (doctorId) match.doctorId = new Types.ObjectId(doctorId);

    const result = await this.bookingModel.aggregate([
      { $match: match },
      { $sort: { bookingDate: 1 } },
      { $limit: 1 },
      {
        $lookup: {
          from: this.doctorModel.collection.name,
          localField: 'doctorId',
          foreignField: '_id',
          as: 'doctorData',
        },
      },
      { $unwind: { path: '$doctorData', preserveNullAndEmptyArrays: true } },
      {
        $addFields: {
          userId: '$patientId',
          doctorId: {
            _id: '$doctorData._id',
            firstName: '$doctorData.firstName',
            lastName: '$doctorData.lastName',
            middleName: '$doctorData.middleName',
            image: '$doctorData.image',
          },
        },
      },
      {
        $project: {
          patientId: 0,
          doctorData: 0,
          workingHoursVersion: 0,
          cancellation: 0,
        },
      },
    ]);

    return result[0] ?? null;
  }

  // ── Find Top Doctors ──────────────────────────────────────────────────────

  async findTopDoctors(limit: number) {
    return this.doctorModel
      .find()
      .sort({ searchCount: -1 })
      .limit(limit)
      .select('firstName lastName middleName image searchCount')
      .lean();
  }

  // ── Find All Bookings For User ────────────────────────────────────────────

  async findAllBookingsForUser(patientId: Types.ObjectId, status?: string) {
    const query: Record<string, any> = { patientId };
    if (status) query.status = status;

    return this.bookingModel
      .find(query)
      .sort({ bookingDate: -1, bookingTime: -1 })
      .populate('doctorId', 'firstName lastName middleName image')
      .lean();
  }

  // ── Find Doctor Patients ──────────────────────────────────────────────────

  async findDoctorPatients(
    doctorId: Types.ObjectId,
    filters: GetDoctorPatientsDto,
  ) {
    const page = Math.max(Number(filters.page) || 1, 1);
    const limit = Math.min(Math.max(Number(filters.limit) || 10, 1), 50);
    const skip = (page - 1) * limit;

    const matchStage: Record<string, any> = {
      doctorId,
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
          localField: 'patientId',
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

  // ── Find My Appointments (Doctor) ─────────────────────────────────────────

  async findMyAppointments(
    doctorId: Types.ObjectId,
    filters: GetMyAppointmentsDto,
  ) {
    const page = Math.max(Number(filters.page) || 1, 1);
    const limit = Math.min(Math.max(Number(filters.limit) || 10, 1), 50);
    const skip = (page - 1) * limit;

    const matchStage: Record<string, any> = {
      doctorId,
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
          localField: 'patientId',
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

  async searchDoctorPatients(
    doctorId: Types.ObjectId,
    filters: SearchPatientsDto,
  ) {
    const page = Math.max(Number(filters.page) || 1, 1);
    const limit = Math.min(Math.max(Number(filters.limit) || 10, 1), 50);
    const skip = (page - 1) * limit;

    const search = filters.search?.trim() ?? null;
    const escaped = search
      ? search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      : null;

    const pipeline: any[] = [
      { $match: { doctorId } },
      {
        $lookup: {
          from: this.userModel.collection.name,
          localField: 'patientId',
          foreignField: '_id',
          as: 'patient',
        },
      },
      { $unwind: { path: '$patient', preserveNullAndEmptyArrays: false } },
    ];

    if (escaped) {
      pipeline.push({
        $match: {
          $or: [
            { 'patient.username': { $regex: escaped, $options: 'i' } },
            { 'patient.phone': { $regex: escaped, $options: 'i' } },
          ],
        },
      });
    }

    pipeline.push(
      // ── Group by patient + collect booking snapshots ──────────────────────
      {
        $group: {
          _id: '$patient._id',
          username: { $first: '$patient.username' },
          phone: { $first: '$patient.phone' },
          image: { $first: '$patient.image' },
          gender: { $first: '$patient.gender' },
          totalVisits: { $sum: 1 },
          lastVisit: { $max: '$bookingDate' },
          firstVisit: { $min: '$bookingDate' },
          // ── collect full booking info per patient ─────────────────────────
          bookings: {
            $push: {
              bookingId: '$_id',
              status: '$status',
              bookingDate: '$bookingDate',
              bookingTime: '$bookingTime',
              bookingEndTime: '$bookingEndTime',
              location: '$location',
              price: '$price',
              createdBy: '$createdBy',
              isRated: '$isRated',
              ratingId: '$ratingId',
              note: '$note',
              completedAt: '$completedAt',
              createdAt: '$createdAt',
            },
          },
        },
      },
      { $sort: { lastVisit: -1 } },
      {
        $facet: {
          data: [
            { $skip: skip },
            { $limit: limit },
            {
              $project: {
                _id: 1,
                username: 1,
                phone: 1,
                image: 1,
                gender: 1,
                totalVisits: 1,
                lastVisit: 1,
                firstVisit: 1,
                bookings: 1, 
              },
            },
          ],
          totalCount: [{ $count: 'count' }],
        },
      },
    );

    const result = await this.bookingModel.aggregate(pipeline);
    const total = result[0]?.totalCount?.[0]?.count ?? 0;

    return {
      patients: result[0]?.data ?? [],
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }
}
