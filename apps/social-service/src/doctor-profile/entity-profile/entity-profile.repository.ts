// entity-profile.repository.ts
import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Doctor } from '@app/common/database/schemas/doctor.schema';
import { Hospital } from '@app/common/database/schemas/hospital.schema';
import { Center } from '@app/common/database/schemas/center.schema';

@Injectable()
export class EntityProfileRepository {
  constructor(
    @InjectModel(Doctor.name) private readonly doctorModel: Model<Doctor>,
    @InjectModel(Hospital.name) private readonly hospitalModel: Model<Hospital>,
    @InjectModel(Center.name) private readonly centerModel: Model<Center>,
  ) {}

  private assertValidId(id: string) {
    if (!Types.ObjectId.isValid(id))
      throw new BadRequestException('common.INVALID_ID');
  }

  async findDoctorById(id: string) {
    this.assertValidId(id);
    return this.doctorModel
      .findOne({ _id: new Types.ObjectId(id), status: 'approved' })
      .select('-password -twoFactorSecret -sessions -workingHoursVersion')
      .lean();
  }

  async findHospitalById(id: string) {
    this.assertValidId(id);
    return this.hospitalModel
      .findOne({ _id: new Types.ObjectId(id), status: 'approved' })
      .select('-deviceTokens')
      .lean();
  }

  async findCenterById(id: string) {
    this.assertValidId(id);
    return this.centerModel
      .findOne({ _id: new Types.ObjectId(id), approvalStatus: 'approved' })
      .select('-deviceTokens')
      .lean();
  }

  async incrementDoctorViews(id: string) {
    await this.doctorModel.updateOne(
      { _id: new Types.ObjectId(id) },
      { $inc: { profileViews: 1 } },
    );
  }

  async incrementHospitalViews(id: string) {
    await this.hospitalModel.updateOne(
      { _id: new Types.ObjectId(id) },
      { $inc: { profileViews: 1 } },
    );
  }

  async incrementCenterViews(id: string) {
    await this.centerModel.updateOne(
      { _id: new Types.ObjectId(id) },
      { $inc: { profileViews: 1 } },
    );
  }
}
