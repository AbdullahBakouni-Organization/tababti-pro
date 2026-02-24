import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Doctor } from '@app/common/database/schemas/doctor.schema';
import { SubCities } from '@app/common/database/schemas/sub-cities.schema';
import {
  AleppoAreas,
  City,
  DamascusAreas,
  DaraaAreas,
  DeirEzzorAreas,
  GeneralSpecialty,
  HamaAreas,
  HassakehAreas,
  HomsAreas,
  IdlibAreas,
  LatakiaAreas,
  PrivateMedicineSpecialty,
  QuneitraAreas,
  RaqqaAreas,
  RuralDamascusAreas,
  SweidaAreas,
  TartousAreas,
} from '@app/common/database/schemas/common.enums';
import { SpecialtyMapping } from '@app/common/database/seeders/spicility.seeder';

@Injectable()
export class DoctorRepository {
  constructor(
    @InjectModel(Doctor.name) private readonly doctorModel: Model<Doctor>,
    @InjectModel(SubCities.name)
    private readonly subcityModel: Model<SubCities>,
  ) { }

  // ======== Find by authAccountId (private profile) ========
  async findByAuthAccountId(authAccountId: string): Promise<Doctor> {
    if (!Types.ObjectId.isValid(authAccountId))
      throw new BadRequestException('doctor.INVALID_ID');

    const doctor = await this.doctorModel
      .findOne({ authAccountId: new Types.ObjectId(authAccountId) })
      .select('-password -twoFactorSecret')
      .lean();

    if (!doctor) throw new NotFoundException('doctor.NOT_FOUND');
    return doctor;
  }

  // ======== Update by authAccountId ========
  async updateByAuthAccountId(
    authAccountId: string,
    updateData: Partial<Doctor>,
  ): Promise<Doctor> {
    if (!Types.ObjectId.isValid(authAccountId))
      throw new BadRequestException('doctor.INVALID_ID');

    const doctor = await this.doctorModel
      .findOneAndUpdate(
        { authAccountId: new Types.ObjectId(authAccountId) },
        { $set: updateData, updatedAt: new Date() },
        { new: true, select: '-password -twoFactorSecret' },
      )
      .lean();

    if (!doctor) throw new NotFoundException('doctor.NOT_FOUND');
    return doctor;
  }

  // ======== Delete by ID ========
  async deleteById(doctorId: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(doctorId))
      throw new BadRequestException('doctor.INVALID_ID');

    const result = await this.doctorModel.deleteOne({
      _id: new Types.ObjectId(doctorId),
    });

    return result.deletedCount === 1;
  }

  // ======== Find by ID (public profile) ========
  async findById(doctorId: string): Promise<Doctor> {
    if (!Types.ObjectId.isValid(doctorId))
      throw new BadRequestException('doctor.INVALID_ID');

    const doctor = await this.doctorModel
      .findOne({ _id: new Types.ObjectId(doctorId), status: 'approved' })
      .select('-password -twoFactorSecret -sessions')
      .lean();

    if (!doctor) throw new NotFoundException('doctor.NOT_FOUND');
    return doctor;
  }

  // ======== Increment profile views ========
  async incrementProfileViews(doctorId: string): Promise<void> {
    if (!Types.ObjectId.isValid(doctorId))
      throw new BadRequestException('doctor.INVALID_ID');

    await this.doctorModel.updateOne(
      { _id: new Types.ObjectId(doctorId) },
      { $inc: { profileViews: 1 } },
    );
  }

  // ======== Check Private Specialization matches Public ========
  checkPrivateSpecializationMatchesPublic(
    publicSpecialization: GeneralSpecialty,
    privateSpecialization: PrivateMedicineSpecialty,
  ): boolean {
    return (
      SpecialtyMapping[publicSpecialization]?.includes(privateSpecialization) ??
      false
    );
  }

  // ======== Check Subcity belongs to City ========
  async checkSubcityBelongsToCity(
    subcity: SubCities,
    city: City,
  ): Promise<boolean> {
    const enumToSubCities = <T extends Record<string, string>>(
      e: T,
    ): SubCities[] => Object.values(e) as unknown as SubCities[];

    const citySubcitiesMap: Record<City, SubCities[]> = {
      [City.Damascus]: enumToSubCities(DamascusAreas),
      [City.RifDimashq]: enumToSubCities(RuralDamascusAreas),
      [City.Aleppo]: enumToSubCities(AleppoAreas),
      [City.Homs]: enumToSubCities(HomsAreas),
      [City.Hama]: enumToSubCities(HamaAreas),
      [City.Latakia]: enumToSubCities(LatakiaAreas),
      [City.Tartus]: enumToSubCities(TartousAreas),
      [City.Idlib]: enumToSubCities(IdlibAreas),
      [City.Daraa]: enumToSubCities(DaraaAreas),
      [City.Quneitra]: enumToSubCities(QuneitraAreas),
      [City.Suwayda]: enumToSubCities(SweidaAreas),
      [City.AlHasakah]: enumToSubCities(HassakehAreas),
      [City.Raqqa]: enumToSubCities(RaqqaAreas),
      [City.DeirEzzor]: enumToSubCities(DeirEzzorAreas),
    };

    return citySubcitiesMap[city]?.includes(subcity) ?? false;
  }
}
