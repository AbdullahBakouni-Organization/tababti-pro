import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { Booking } from '@app/common/database/schemas/booking.schema';
import { Doctor } from '@app/common/database/schemas/doctor.schema';
import { User } from '@app/common/database/schemas/user.schema';
import { Center } from '@app/common/database/schemas/center.schema';
import { Hospital } from '@app/common/database/schemas/hospital.schema';
import { BookingStatus } from '@app/common/database/schemas/common.enums';

import { GetDoctorPatientsDto } from './dto/get-doctor-patients.dto';
import { GetMyAppointmentsDto } from './dto/get-my-appointments.dto';

@Injectable()
export class NearbyBookingRepository {
  constructor(
    @InjectModel(Booking.name) private readonly bookingModel: Model<Booking>,
    @InjectModel(Doctor.name) private readonly doctorModel: Model<Doctor>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(Center.name) private readonly centerModel: Model<Center>,
    @InjectModel(Hospital.name) private readonly hospitalModel: Model<Hospital>,
  ) {}

  // ── Helpers ───────────────────────────────────────────────────────────────

  async findUserByAuthAccountId(authAccountId: string) {
    return this.userModel
      .findOne({ authAccountId: new Types.ObjectId(authAccountId) })
      .lean();
  }

  async findDoctorByAuthAccountId(authAccountId: string) {
    return this.doctorModel
      .findOne({ authAccountId: new Types.ObjectId(authAccountId) })
      .lean();
  }

  // ── Find Top Doctors (paginated) ──────────────────────────────────────────
  // Returns: firstName, lastName, middleName, image, searchCount,
  //          specialization{_id,name}, city{_id,name}, subcity{_id,name}

  async findTopDoctors(page: number, limit: number) {
    const skip = (page - 1) * limit;

    const [doctors, total] = await Promise.all([
      this.doctorModel.aggregate([
        // stable sort: highest searchCount first, then _id for tiebreaker
        { $sort: { searchCount: -1, _id: 1 } },
        { $skip: skip },
        { $limit: limit },

        // privateSpecialization
        {
          $lookup: {
            from: 'privatespecializations',
            localField: 'privateSpecializationId',
            foreignField: '_id',
            as: 'specialization',
          },
        },
        {
          $unwind: {
            path: '$specialization',
            preserveNullAndEmptyArrays: true,
          },
        },

        // city (collection: 'cities')
        {
          $lookup: {
            from: 'cities',
            localField: 'cityId',
            foreignField: '_id',
            as: 'cityData',
          },
        },
        { $unwind: { path: '$cityData', preserveNullAndEmptyArrays: true } },

        // subcity (collection: 'subcities', field: subcityId)
        {
          $lookup: {
            from: 'subcities',
            localField: 'subcityId',
            foreignField: '_id',
            as: 'subcityData',
          },
        },
        { $unwind: { path: '$subcityData', preserveNullAndEmptyArrays: true } },

        {
          $project: {
            _id: 1,
            firstName: 1,
            lastName: 1,
            middleName: 1,
            image: 1,
            searchCount: 1,
            latitude: 1,
            longitude: 1,
            specialization: {
              $cond: {
                if: { $ifNull: ['$specialization._id', false] },
                then: {
                  _id: '$specialization._id',
                  name: '$specialization.name',
                },
                else: '$$REMOVE',
              },
            },
            city: {
              $cond: {
                if: { $ifNull: ['$cityData._id', false] },
                then: { _id: '$cityData._id', name: '$cityData.name' },
                else: '$$REMOVE',
              },
            },
            subcity: {
              $cond: {
                if: { $ifNull: ['$subcityData._id', false] },
                then: { _id: '$subcityData._id', name: '$subcityData.name' },
                else: '$$REMOVE',
              },
            },
          },
        },
      ]),

      this.doctorModel.countDocuments(),
    ]);

    return {
      data: doctors,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // ── Find Upcoming Bookings For Doctor (paginated) ─────────────────────────
  // Booking schema: patientId(ref:User), doctorId(ref:Doctor), slotId,
  //   status, bookingDate(Date), bookingTime(String HH:MM),
  //   bookingEndTime(String), location{type,entity_name,address},
  //   price, createdBy, isRated, ratingId, note, completedAt

  async findNextBookingsForDoctor(
    doctorId: Types.ObjectId,
    page: number,
    limit: number,
  ) {
    const skip = (page - 1) * limit;

    const result = await this.bookingModel.aggregate([
      {
        $match: {
          doctorId,
          // upcoming: only future dates, only active statuses
          status: { $in: [BookingStatus.PENDING, BookingStatus.CONFIRMED] },
          bookingDate: { $gte: new Date() },
        },
      },
      // sort by nearest date, then earliest time slot (string HH:MM sorts correctly)
      { $sort: { bookingDate: 1, bookingTime: 1 } },

      // join patient info
      {
        $lookup: {
          from: this.userModel.collection.name,
          localField: 'patientId',
          foreignField: '_id',
          as: 'patientData',
        },
      },
      { $unwind: { path: '$patientData', preserveNullAndEmptyArrays: true } },

      {
        $project: {
          _id: 1,
          status: 1,
          bookingDate: 1,
          bookingTime: 1,
          bookingEndTime: 1,
          location: 1,
          price: 1,
          createdBy: 1,
          isRated: 1,
          ratingId: 1,
          note: 1,
          slotId: 1,
          createdAt: 1,
          patient: {
            _id: '$patientData._id',
            username: '$patientData.username',
            phone: '$patientData.phone',
            image: '$patientData.image',
          },
        },
      },

      {
        $facet: {
          data: [{ $skip: skip }, { $limit: limit }],
          totalCount: [{ $count: 'count' }],
        },
      },
    ]);

    const total = result[0]?.totalCount?.[0]?.count ?? 0;
    return {
      data: result[0]?.data ?? [],
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // ── Find Upcoming Bookings For User (paginated) ───────────────────────────

  async findNextBookingsForUser(
    patientId: Types.ObjectId,
    page: number,
    limit: number,
    doctorId?: string,
  ) {
    const skip = (page - 1) * limit;

    const match: Record<string, any> = {
      patientId,
      status: { $in: [BookingStatus.PENDING, BookingStatus.CONFIRMED] },
      bookingDate: { $gte: new Date() },
    };
    if (doctorId) match.doctorId = new Types.ObjectId(doctorId);

    const result = await this.bookingModel.aggregate([
      { $match: match },
      { $sort: { bookingDate: 1, bookingTime: 1 } },

      // join doctor info
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
        $project: {
          _id: 1,
          status: 1,
          bookingDate: 1,
          bookingTime: 1,
          bookingEndTime: 1,
          location: 1,
          price: 1,
          createdBy: 1,
          isRated: 1,
          ratingId: 1,
          note: 1,
          slotId: 1,
          createdAt: 1,
          doctor: {
            _id: '$doctorData._id',
            firstName: '$doctorData.firstName',
            lastName: '$doctorData.lastName',
            middleName: '$doctorData.middleName',
            image: '$doctorData.image',
          },
        },
      },

      {
        $facet: {
          data: [{ $skip: skip }, { $limit: limit }],
          totalCount: [{ $count: 'count' }],
        },
      },
    ]);

    const total = result[0]?.totalCount?.[0]?.count ?? 0;
    return {
      data: result[0]?.data ?? [],
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // ── Find All Bookings For User (paginated) ────────────────────────────────

  async findAllBookingsForUser(
    patientId: Types.ObjectId,
    status?: string,
    page = 1,
    limit = 10,
  ) {
    const skip = (page - 1) * limit;
    const query: Record<string, any> = { patientId };
    if (status) query.status = status;

    const [data, total] = await Promise.all([
      this.bookingModel
        .find(query)
        .sort({ bookingDate: -1, bookingTime: -1 })
        .skip(skip)
        .limit(limit)
        .populate('doctorId', 'firstName lastName middleName image')
        .lean(),
      this.bookingModel.countDocuments(query),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  // ── Find Doctor Patients (paginated) ─────────────────────────────────────
  // "Patients" = users who had COMPLETED bookings with this doctor
  // Groups by patient, counts visits, shows last visit date

  async findDoctorPatients(
    doctorId: Types.ObjectId,
    filters: GetDoctorPatientsDto,
  ) {
    const page = Math.max(Number(filters.page) || 1, 1);
    const limit = Math.min(Math.max(Number(filters.limit) || 10, 1), 50);
    const skip = (page - 1) * limit;

    // only COMPLETED bookings or those with completedAt set
    const matchStage: Record<string, any> = {
      doctorId,
      $or: [
        { status: BookingStatus.COMPLETED },
        { completedAt: { $ne: null, $exists: true } },
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
          firstVisit: { $min: '$bookingDate' },
        },
      },
      { $sort: { lastVisit: -1, _id: 1 } },
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
      data: result[0]?.data ?? [],
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // ── Find My Appointments (paginated) ─────────────────────────────────────
  // All bookings for a doctor (PENDING + CONFIRMED + COMPLETED), sorted newest first

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
      // sort newest booking first, stable with _id
      { $sort: { bookingDate: -1, bookingTime: -1, _id: 1 } },
      {
        $project: {
          _id: 1,
          status: 1,
          bookingDate: 1,
          bookingTime: 1,
          bookingEndTime: 1,
          location: 1,
          price: 1,
          createdBy: 1,
          isRated: 1,
          ratingId: 1,
          note: 1,
          completedAt: 1,
          slotId: 1,
          createdAt: 1,
          patient: {
            _id: '$patient._id',
            username: '$patient.username',
            phone: '$patient.phone',
            image: '$patient.image',
          },
        },
      },
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
      data: result[0]?.data ?? [],
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // ── Search Doctor Patients (paginated) ───────────────────────────────────
  // Searches across ALL bookings (any status) grouped by patient
  // Returns full booking history per patient

  async searchDoctorPatients(
    doctorId: Types.ObjectId,
    search: string,
    page: number,
    limit: number,
  ) {
    const skip = (page - 1) * limit;
    const escaped = search?.trim()
      ? search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      : null;

    const pipeline: any[] = [
      // only bookings for this doctor
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
          bookings: {
            $push: {
              bookingId: '$_id',
              slotId: '$slotId',
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
      { $sort: { lastVisit: -1, _id: 1 } },
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
      data: result[0]?.data ?? [],
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }
}
