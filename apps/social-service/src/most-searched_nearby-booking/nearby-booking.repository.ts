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
import { SearchPatientsDto, SearchType } from './dto/search-patients.dto';
import { PatientDetailDto } from './dto/patient-detail.dto';

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

  private escapeRegex(str: string): string {
    return str.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private safePage(p: any): number {
    return Math.max(Number(p) || 1, 1);
  }
  private safeLimit(l: any): number {
    return Math.min(Math.max(Number(l) || 10, 1), 50);
  }

  // ── Top Doctors ───────────────────────────────────────────────────────────
  async findTopDoctors(page: number, limit: number) {
    const skip = (page - 1) * limit;
    const [doctors, total] = await Promise.all([
      this.doctorModel.aggregate([
        { $sort: { searchCount: -1, _id: 1 } },
        { $skip: skip },
        { $limit: limit },
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
        {
          $lookup: {
            from: 'cities',
            localField: 'cityId',
            foreignField: '_id',
            as: 'cityData',
          },
        },
        { $unwind: { path: '$cityData', preserveNullAndEmptyArrays: true } },
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

  // ── Next Bookings For Doctor ──────────────────────────────────────────────
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
          status: { $in: [BookingStatus.PENDING, BookingStatus.CONFIRMED] },
          bookingDate: { $gte: new Date() },
        },
      },
      { $sort: { bookingDate: 1, bookingTime: 1 } },
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
          note: 1,
          slotId: 1,
          createdAt: 1,
          createdBy: 1,
          isRated: 1,
          ratingId: 1,
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

  // ── Next Bookings For User ────────────────────────────────────────────────
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
          note: 1,
          slotId: 1,
          createdAt: 1,
          createdBy: 1,
          isRated: 1,
          ratingId: 1,
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

  // ── All Bookings For User ─────────────────────────────────────────────────
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

  // ── Doctor Patients (completed visits only) ───────────────────────────────
  async findDoctorPatients(
    doctorId: Types.ObjectId,
    filters: GetDoctorPatientsDto,
  ) {
    const page = this.safePage(filters.page);
    const limit = this.safeLimit(filters.limit);
    const skip = (page - 1) * limit;

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
      const escaped = this.escapeRegex(filters.search);
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

  // ── My Appointments ───────────────────────────────────────────────────────
  async findMyAppointments(
    doctorId: Types.ObjectId,
    filters: GetMyAppointmentsDto,
  ) {
    const page = this.safePage(filters.page);
    const limit = this.safeLimit(filters.limit);
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
      const escaped = this.escapeRegex(filters.search);
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
          note: 1,
          completedAt: 1,
          slotId: 1,
          createdAt: 1,
          createdBy: 1,
          isRated: 1,
          ratingId: 1,
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

  // ── Search Patients V2 (filters + stats + gender breakdown) ──────────────
  async searchDoctorPatientsV2(
    doctorId: Types.ObjectId,
    filters: SearchPatientsDto,
  ) {
    const page = this.safePage(filters.page);
    const limit = this.safeLimit(filters.limit);
    const searchType = filters.searchType ?? SearchType.ALL;

    const shouldSearchPatients =
      searchType === SearchType.ALL || searchType === SearchType.PATIENTS;
    const shouldSearchDoctors =
      searchType === SearchType.ALL || searchType === SearchType.DOCTORS;
    const shouldSearchHospitals =
      searchType === SearchType.ALL || searchType === SearchType.HOSPITALS;
    const shouldSearchCenters =
      searchType === SearchType.ALL || searchType === SearchType.CENTERS;

    // run all searches in parallel
    const [patientsResult, doctorsResult, hospitalsResult, centersResult] =
      await Promise.all([
        shouldSearchPatients
          ? this._searchPatients(doctorId, filters, page, limit)
          : Promise.resolve({ data: [], total: 0, stats: null }),

        shouldSearchDoctors
          ? this._searchDoctors(filters, page, limit)
          : Promise.resolve({ data: [], total: 0 }),

        shouldSearchHospitals
          ? this._searchHospitals(filters, page, limit)
          : Promise.resolve({ data: [], total: 0 }),

        shouldSearchCenters
          ? this._searchCenters(filters, page, limit)
          : Promise.resolve({ data: [], total: 0 }),
      ]);

    return {
      patients: {
        data: patientsResult.data,
        total: patientsResult.total,
        stats: patientsResult.stats,
      },
      doctors: {
        data: doctorsResult.data,
        total: doctorsResult.total,
      },
      hospitals: {
        data: hospitalsResult.data,
        total: hospitalsResult.total,
      },
      centers: {
        data: centersResult.data,
        total: centersResult.total,
      },
      pagination: {
        page,
        limit,
      },
    };
  }

  // ── Private: Search Patients ──────────────────────────────────────────────
  private async _searchPatients(
    doctorId: Types.ObjectId,
    filters: SearchPatientsDto,
    page: number,
    limit: number,
  ) {
    const skip = (page - 1) * limit;

    // booking match
    const bookingMatch: Record<string, any> = { doctorId };
    if (filters.status) bookingMatch.status = filters.status;
    if (filters.locationType)
      bookingMatch['location.type'] = filters.locationType;
    if (filters.locationName) {
      bookingMatch['location.entity_name'] = {
        $regex: this.escapeRegex(filters.locationName),
        $options: 'i',
      };
    }
    if (filters.fromDate || filters.toDate) {
      bookingMatch.bookingDate = {};
      if (filters.fromDate)
        bookingMatch.bookingDate.$gte = new Date(filters.fromDate);
      if (filters.toDate) {
        const end = new Date(filters.toDate);
        end.setHours(23, 59, 59, 999);
        bookingMatch.bookingDate.$lte = end;
      }
    }

    const pipeline: any[] = [
      { $match: bookingMatch },
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

    // patient filters
    const patientMatch: Record<string, any> = {};
    if (filters.search) {
      const esc = this.escapeRegex(filters.search);
      patientMatch.$or = [
        { 'patient.username': { $regex: esc, $options: 'i' } },
        { 'patient.phone': { $regex: esc, $options: 'i' } },
      ];
    }
    if (filters.gender) patientMatch['patient.gender'] = filters.gender;
    if (Object.keys(patientMatch).length > 0) {
      pipeline.push({ $match: patientMatch });
    }

    pipeline.push(
      {
        $group: {
          _id: '$patient._id',
          username: { $first: '$patient.username' },
          phone: { $first: '$patient.phone' },
          image: { $first: '$patient.image' },
          gender: { $first: '$patient.gender' },
          dateOfBirth: { $first: '$patient.DataofBirth' },
          totalVisits: { $sum: 1 },
          completedVisits: {
            $sum: {
              $cond: [{ $eq: ['$status', BookingStatus.COMPLETED] }, 1, 0],
            },
          },
          totalPaid: {
            $sum: {
              $cond: [
                { $eq: ['$status', BookingStatus.COMPLETED] },
                '$price',
                0,
              ],
            },
          },
          lastVisitDate: { $max: '$bookingDate' },
          lastVisitTime: { $last: '$bookingTime' },
          lastVisitEndTime: { $last: '$bookingEndTime' },
          lastVisitLocation: { $last: '$location' },
          lastVisitStatus: { $last: '$status' },
          recentBookings: {
            $push: {
              bookingId: '$_id',
              status: '$status',
              bookingDate: '$bookingDate',
              bookingTime: '$bookingTime',
              bookingEndTime: '$bookingEndTime',
              location: '$location',
              price: '$price',
            },
          },
        },
      },
      { $sort: { lastVisitDate: -1, _id: 1 } },
      {
        $facet: {
          data: [
            { $skip: skip },
            { $limit: limit },
            {
              $project: {
                patientId: '$_id',
                type: { $literal: 'PATIENT' },
                username: 1,
                phone: 1,
                image: 1,
                gender: 1,
                dateOfBirth: 1,
                totalVisits: 1,
                completedVisits: 1,
                totalPaid: 1,
                lastVisit: {
                  date: '$lastVisitDate',
                  time: '$lastVisitTime',
                  endTime: '$lastVisitEndTime',
                  location: '$lastVisitLocation',
                  status: '$lastVisitStatus',
                },
                recentBookings: { $slice: ['$recentBookings', -3] },
              },
            },
          ],
          totalCount: [{ $count: 'count' }],
          genderStats: [{ $group: { _id: '$gender', count: { $sum: 1 } } }],
          totals: [
            {
              $group: {
                _id: null,
                totalRevenue: { $sum: '$totalPaid' },
                totalVisits: { $sum: '$totalVisits' },
              },
            },
          ],
        },
      },
    );

    const result = await this.bookingModel.aggregate(pipeline);
    const total = result[0]?.totalCount?.[0]?.count ?? 0;

    const genderBreakdown: Record<string, number> = {};
    for (const g of result[0]?.genderStats ?? []) {
      if (g._id) genderBreakdown[g._id] = g.count;
    }

    return {
      data: result[0]?.data ?? [],
      total,
      stats: {
        totalPatients: total,
        totalRevenue: result[0]?.totals?.[0]?.totalRevenue ?? 0,
        totalVisits: result[0]?.totals?.[0]?.totalVisits ?? 0,
        genderBreakdown,
      },
    };
  }

  // ── Private: Search Doctors ───────────────────────────────────────────────
  private async _searchDoctors(
    filters: SearchPatientsDto,
    page: number,
    limit: number,
  ) {
    const skip = (page - 1) * limit;
    if (!filters.search) return { data: [], total: 0 };

    const esc = this.escapeRegex(filters.search);
    const match: Record<string, any> = {
      $or: [
        { firstName: { $regex: esc, $options: 'i' } },
        { lastName: { $regex: esc, $options: 'i' } },
        { middleName: { $regex: esc, $options: 'i' } },
        { 'phones.normal': { $elemMatch: { $regex: esc, $options: 'i' } } },
      ],
    };
    if (filters.gender) match.gender = filters.gender;

    const [data, total] = await Promise.all([
      this.doctorModel
        .find(match)
        .select(
          'firstName middleName lastName image gender city subcity ' +
            'publicSpecialization privateSpecialization ' +
            'inspectionPrice inspectionDuration rating phones',
        )
        .sort({ rating: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.doctorModel.countDocuments(match),
    ]);

    return {
      data: data.map((d) => ({ ...d, type: 'DOCTOR' })),
      total,
    };
  }

  // ── Private: Search Hospitals ─────────────────────────────────────────────
  private async _searchHospitals(
    filters: SearchPatientsDto,
    page: number,
    limit: number,
  ) {
    const skip = (page - 1) * limit;
    if (!filters.search) return { data: [], total: 0 };

    const esc = this.escapeRegex(filters.search);
    const match: Record<string, any> = {
      $or: [
        { name: { $regex: esc, $options: 'i' } },
        { address: { $regex: esc, $options: 'i' } },
      ],
    };

    const [data, total] = await Promise.all([
      this.hospitalModel
        .find(match)
        .select('name address image city subcity phones')
        .skip(skip)
        .limit(limit)
        .lean(),
      this.hospitalModel.countDocuments(match),
    ]);

    return {
      data: data.map((h) => ({ ...h, type: 'HOSPITAL' })),
      total,
    };
  }

  // ── Private: Search Centers ───────────────────────────────────────────────
  private async _searchCenters(
    filters: SearchPatientsDto,
    page: number,
    limit: number,
  ) {
    const skip = (page - 1) * limit;
    if (!filters.search) return { data: [], total: 0 };

    const esc = this.escapeRegex(filters.search);
    const match: Record<string, any> = {
      $or: [
        { name: { $regex: esc, $options: 'i' } },
        { address: { $regex: esc, $options: 'i' } },
      ],
    };

    const [data, total] = await Promise.all([
      this.centerModel
        .find(match)
        .select('name address image city subcity phones')
        .skip(skip)
        .limit(limit)
        .lean(),
      this.centerModel.countDocuments(match),
    ]);

    return {
      data: data.map((c) => ({ ...c, type: 'CENTER' })),
      total,
    };
  }

  async getPatientDetail(doctorId: Types.ObjectId, dto: PatientDetailDto) {
    const page = this.safePage(dto.page);
    const limit = this.safeLimit(dto.limit);
    const skip = (page - 1) * limit;

    // ── patient info ─────────────────────────────────────────────────────────
    const patient = await this.userModel
      .findById(dto.patientId)
      .select('username phone image gender dateOfBirth')
      .lean();
    if (!patient) return null;

    const patientObjId = new Types.ObjectId(dto.patientId);

    // ── overall stats (all bookings, all statuses) ───────────────────────────
    const [statsResult] = await this.bookingModel.aggregate([
      { $match: { doctorId, patientId: patientObjId } },
      {
        $group: {
          _id: null,
          totalAppointments: { $sum: 1 },
          completedAppointments: {
            $sum: {
              $cond: [{ $eq: ['$status', BookingStatus.COMPLETED] }, 1, 0],
            },
          },
          totalPaid: {
            $sum: {
              $cond: [
                { $eq: ['$status', BookingStatus.COMPLETED] },
                '$price',
                0,
              ],
            },
          },
        },
      },
    ]);

    // ── paginated bookings list ───────────────────────────────────────────────
    const bookingMatch: Record<string, any> = {
      doctorId,
      patientId: patientObjId,
    };
    if (dto.status) bookingMatch.status = dto.status;

    const [bookingsResult] = await this.bookingModel.aggregate([
      { $match: bookingMatch },
      { $sort: { bookingDate: -1, bookingTime: -1 } },
      {
        $facet: {
          data: [
            { $skip: skip },
            { $limit: limit },
            {
              $project: {
                bookingId: '$_id',
                status: 1,
                bookingDate: 1,
                bookingTime: 1,
                bookingEndTime: 1,
                price: 1,
                location: 1,
                note: 1,
                completedAt: 1,
                cancellation: 1,
                createdBy: 1,
                isRated: 1,
              },
            },
          ],
          totalCount: [{ $count: 'count' }],
        },
      },
    ]);

    const total = bookingsResult?.totalCount?.[0]?.count ?? 0;

    return {
      patient: {
        patientId: patient._id,
        username: patient.username,
        phone: patient.phone,
        image: patient.image,
        gender: patient.gender,
        dateOfBirth: patient.DataofBirth,
      },
      stats: {
        totalPaid: statsResult?.totalPaid ?? 0,
        completedAppointments: statsResult?.completedAppointments ?? 0,
        totalAppointments: statsResult?.totalAppointments ?? 0,
      },
      appointments: bookingsResult?.data ?? [],
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page < Math.ceil(total / limit),
        hasPreviousPage: page > 1,
      },
    };
  }
}
