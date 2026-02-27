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

  // ── Gallery — Get ───────────────────────────────────────────────────────────

  async getDoctorGallery(id: string): Promise<string[]> {
    this.assertValidId(id);
    const doc = await this.doctorModel
      .findOne({ _id: new Types.ObjectId(id) })
      .select('gallery')
      .lean();
    return doc?.gallery ?? [];
  }

  async getHospitalGallery(id: string): Promise<string[]> {
    this.assertValidId(id);
    const doc = await this.hospitalModel
      .findOne({ _id: new Types.ObjectId(id) })
      .select('gallery')
      .lean();
    return doc?.gallery ?? [];
  }

  async getCenterGallery(id: string): Promise<string[]> {
    this.assertValidId(id);
    const doc = await this.centerModel
      .findOne({ _id: new Types.ObjectId(id) })
      .select('gallery')
      .lean();
    return doc?.gallery ?? [];
  }

  // ── Gallery — Add ───────────────────────────────────────────────────────────

  async addDoctorGallery(id: string, images: string[]): Promise<string[]> {
    this.assertValidId(id);
    const doc = await this.doctorModel
      .findOneAndUpdate(
        { _id: new Types.ObjectId(id) },
        { $addToSet: { gallery: { $each: images } } }, // $addToSet prevents duplicates
        { new: true },
      )
      .select('gallery')
      .lean();
    return doc?.gallery ?? [];
  }

  async addHospitalGallery(id: string, images: string[]): Promise<string[]> {
    this.assertValidId(id);
    const doc = await this.hospitalModel
      .findOneAndUpdate(
        { _id: new Types.ObjectId(id) },
        { $addToSet: { gallery: { $each: images } } },
        { new: true },
      )
      .select('gallery')
      .lean();
    return doc?.gallery ?? [];
  }

  async addCenterGallery(id: string, images: string[]): Promise<string[]> {
    this.assertValidId(id);
    const doc = await this.centerModel
      .findOneAndUpdate(
        { _id: new Types.ObjectId(id) },
        { $addToSet: { gallery: { $each: images } } },
        { new: true },
      )
      .select('gallery')
      .lean();
    return doc?.gallery ?? [];
  }

  // ── Gallery — Remove ────────────────────────────────────────────────────────

  async removeDoctorGallery(id: string, images: string[]): Promise<string[]> {
    this.assertValidId(id);
    const doc = await this.doctorModel
      .findOneAndUpdate(
        { _id: new Types.ObjectId(id) },
        { $pullAll: { gallery: images } },
        { new: true },
      )
      .select('gallery')
      .lean();
    return doc?.gallery ?? [];
  }

  async removeHospitalGallery(id: string, images: string[]): Promise<string[]> {
    this.assertValidId(id);
    const doc = await this.hospitalModel
      .findOneAndUpdate(
        { _id: new Types.ObjectId(id) },
        { $pullAll: { gallery: images } },
        { new: true },
      )
      .select('gallery')
      .lean();
    return doc?.gallery ?? [];
  }

  async removeCenterGallery(id: string, images: string[]): Promise<string[]> {
    this.assertValidId(id);
    const doc = await this.centerModel
      .findOneAndUpdate(
        { _id: new Types.ObjectId(id) },
        { $pullAll: { gallery: images } },
        { new: true },
      )
      .select('gallery')
      .lean();
    return doc?.gallery ?? [];
  }

  // ── Gallery — Clear All ─────────────────────────────────────────────────────

  async clearDoctorGallery(id: string): Promise<void> {
    this.assertValidId(id);
    await this.doctorModel.updateOne(
      { _id: new Types.ObjectId(id) },
      { $set: { gallery: [] } },
    );
  }

  async clearHospitalGallery(id: string): Promise<void> {
    this.assertValidId(id);
    await this.hospitalModel.updateOne(
      { _id: new Types.ObjectId(id) },
      { $set: { gallery: [] } },
    );
  }

  async clearCenterGallery(id: string): Promise<void> {
    this.assertValidId(id);
    await this.centerModel.updateOne(
      { _id: new Types.ObjectId(id) },
      { $set: { gallery: [] } },
    );
  }
}
