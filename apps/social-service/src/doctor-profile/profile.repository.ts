// profile.repository.ts
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Doctor } from '@app/common/database/schemas/doctor.schema';
import {
  GeneralSpecialty,
  PrivateMedicineSpecialty,
} from '@app/common/database/schemas/common.enums';
import { SpecialtyMapping } from '@app/common/database/seeders/spicility.seeder';

@Injectable()
export class DoctorRepository {
  constructor(
    @InjectModel(Doctor.name) private readonly doctorModel: Model<Doctor>,
  ) {}

  // ── Find by authAccountId ──────────────────────────────────────────────
  async findByAuthAccountId(authAccountId: string): Promise<Doctor | null> {
    if (!Types.ObjectId.isValid(authAccountId))
      throw new BadRequestException('doctor.INVALID_ID');

    return this.doctorModel
      .findOne({ authAccountId: new Types.ObjectId(authAccountId) })
      .select('-password -twoFactorSecret')
      .lean();
  }

  // ── Update by authAccountId ────────────────────────────────────────────
  async updateByAuthAccountId(
    authAccountId: string,
    updateData: Partial<Doctor>,
  ): Promise<Doctor | null> {
    if (!Types.ObjectId.isValid(authAccountId))
      throw new BadRequestException('doctor.INVALID_ID');

    return this.doctorModel
      .findOneAndUpdate(
        { authAccountId: new Types.ObjectId(authAccountId) },
        { $set: updateData },
        { new: true, select: '-password -twoFactorSecret' },
      )
      .lean();
  }

  // ── Delete by ID ───────────────────────────────────────────────────────
  async deleteById(doctorId: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(doctorId))
      throw new BadRequestException('doctor.INVALID_ID');

    const result = await this.doctorModel.deleteOne({
      _id: new Types.ObjectId(doctorId),
    });

    return result.deletedCount === 1;
  }

  // ── Find by ID — approved doctors only (public) ────────────────────────
  async findById(doctorId: string): Promise<Doctor | null> {
    if (!Types.ObjectId.isValid(doctorId))
      throw new BadRequestException('doctor.INVALID_ID');

    return this.doctorModel
      .findOne({ _id: new Types.ObjectId(doctorId), status: 'approved' })
      .select('-password -twoFactorSecret -sessions')
      .lean();
  }

  // ── Increment profile views ────────────────────────────────────────────
  async incrementProfileViews(doctorId: string): Promise<void> {
    if (!Types.ObjectId.isValid(doctorId))
      throw new BadRequestException('doctor.INVALID_ID');

    await this.doctorModel.updateOne(
      { _id: new Types.ObjectId(doctorId) },
      { $inc: { profileViews: 1 } },
    );
  }

  // ── Pure validation: specialization pairing ────────────────────────────
  checkPrivateSpecializationMatchesPublic(
    publicSpecialization: GeneralSpecialty,
    privateSpecialization: PrivateMedicineSpecialty,
  ): boolean {
    return (
      SpecialtyMapping[publicSpecialization]?.includes(privateSpecialization) ??
      false
    );
  }
}
