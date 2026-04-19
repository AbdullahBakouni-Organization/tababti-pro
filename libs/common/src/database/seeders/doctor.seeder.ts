import * as dotenv from 'dotenv';
dotenv.config();

import { Injectable } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { faker } from '@faker-js/faker';

import { DatabaseModule } from '../database.module';
import { Doctor } from '../schemas/doctor.schema';
import { AuthAccount } from '../schemas/auth.schema';
import { Cities } from '../schemas/cities.schema';
import { PublicSpecialization } from '../schemas/publicspecializations.schema';
import { PrivateSpecialization } from '../schemas/privatespecializations.schema';
import { Hospital } from '../schemas/hospital.schema';
import { Center } from '../schemas/center.schema';
import {
  UserRole,
  Gender,
  ApprovalStatus,
  Days,
  WorkigEntity,
  City,
  DamascusAreas,
  RuralDamascusAreas,
  AleppoAreas,
  HomsAreas,
  HamaAreas,
  LatakiaAreas,
  TartousAreas,
  IdlibAreas,
  DaraaAreas,
  QuneitraAreas,
  SweidaAreas,
  HassakehAreas,
  RaqqaAreas,
  DeirEzzorAreas,
} from '../schemas/common.enums';

const CityMapping: Record<string, string[]> = {
  [City.Damascus]: Object.values(DamascusAreas),
  [City.RifDimashq]: Object.values(RuralDamascusAreas),
  [City.Aleppo]: Object.values(AleppoAreas),
  [City.Homs]: Object.values(HomsAreas),
  [City.Hama]: Object.values(HamaAreas),
  [City.Latakia]: Object.values(LatakiaAreas),
  [City.Tartus]: Object.values(TartousAreas),
  [City.Idlib]: Object.values(IdlibAreas),
  [City.Daraa]: Object.values(DaraaAreas),
  [City.Quneitra]: Object.values(QuneitraAreas),
  [City.Suwayda]: Object.values(SweidaAreas),
  [City.AlHasakah]: Object.values(HassakehAreas),
  [City.Raqqa]: Object.values(RaqqaAreas),
  [City.DeirEzzor]: Object.values(DeirEzzorAreas),
};

@Injectable()
export class DoctorSeeder {
  constructor(private app) {}
  async seed() {
    // Hard guard: never run the destructive seeder against a production DB.
    // `deleteMany({})` runs below — wiping real doctor records would be a
    // full outage.
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'DoctorSeeder refuses to run with NODE_ENV=production. ' +
          'Set NODE_ENV=development or unset it before seeding.',
      );
    }

    const seedPassword = process.env.SEED_DOCTOR_PASSWORD;
    if (!seedPassword || seedPassword.length < 8) {
      throw new Error(
        'SEED_DOCTOR_PASSWORD env var is required (min 8 chars) to run DoctorSeeder.',
      );
    }

    console.log('🌱 Starting Doctor Seed...\n');

    const app = await NestFactory.createApplicationContext(DatabaseModule);

    const doctorModel = app.get<Model<Doctor>>(getModelToken(Doctor.name));
    const authModel = app.get<Model<AuthAccount>>(
      getModelToken(AuthAccount.name),
    );
    const cityModel = app.get<Model<Cities>>(getModelToken(Cities.name));
    const publicSpecModel = app.get<Model<PublicSpecialization>>(
      getModelToken(PublicSpecialization.name),
    );
    const privateSpecModel = app.get<Model<PrivateSpecialization>>(
      getModelToken(PrivateSpecialization.name),
    );
    const hospitalModel = app.get<Model<Hospital>>(
      getModelToken(Hospital.name),
    );
    const centerModel = app.get<Model<Center>>(getModelToken(Center.name));

    await doctorModel.deleteMany({});
    console.log('🗑️  Cleared existing doctors\n');

    const cities = await cityModel.find();
    const publicSpecs = await publicSpecModel.find();
    const privateSpecs = await privateSpecModel.find();
    const hospitals = await hospitalModel.find();
    const centers = await centerModel.find();

    console.log('📊 Loaded Data:');
    console.log(
      'Cities:',
      cities.map((c) => c.name),
    );
    console.log(
      'Public Specializations:',
      publicSpecs.map((p) => p.name),
    );
    console.log('Private Specializations count:', privateSpecs.length);
    console.log('Hospitals count:', hospitals.length);
    console.log('Centers count:', centers.length, '\n');

    if (!cities.length || !publicSpecs.length || !privateSpecs.length) {
      console.error('❌ Missing required seed data: cities or specializations');
      await app.close();
      return;
    }

    function generateSyrianPhone(): string {
      return '+9639' + faker.string.numeric(8);
    }

    let createdCount = 0;

    for (let i = 0; i < 50; i++) {
      const city = cities[Math.floor(Math.random() * cities.length)];
      const areas = CityMapping[city.name];
      if (!areas || !areas.length) {
        console.warn(
          `⚠️ No areas found for city "${city.name}", skipping doctor ${i + 1}`,
        );
        continue;
      }

      const randomArea = areas[Math.floor(Math.random() * areas.length)];
      const publicSpec =
        publicSpecs[Math.floor(Math.random() * publicSpecs.length)];
      const privateSpecCandidates = privateSpecs.filter((p) =>
        p.publicSpecializationId.equals(publicSpec._id),
      );

      if (!privateSpecCandidates.length) {
        console.warn(
          `⚠️ No private specialization for publicSpec "${publicSpec.name}", skipping doctor ${i + 1}`,
        );
        continue;
      }

      const privateSpec =
        privateSpecCandidates[
          Math.floor(Math.random() * privateSpecCandidates.length)
        ];
      const hospitalCandidates = hospitals.filter((h) =>
        h.cityId.equals(city._id),
      );
      const centerCandidates = centers.filter((c) => c.cityId.equals(city._id));

      console.log(
        `City: ${city.name}, Area: ${randomArea}, PublicSpec: ${publicSpec.name}, PrivateSpecCandidates: ${privateSpecCandidates.length}, Hospitals: ${hospitalCandidates.length}, Centers: ${centerCandidates.length}`,
      );

      const hospital = hospitalCandidates.length
        ? hospitalCandidates[
            Math.floor(Math.random() * hospitalCandidates.length)
          ]
        : null;
      const center = centerCandidates.length
        ? centerCandidates[Math.floor(Math.random() * centerCandidates.length)]
        : null;

      const authAccount = await authModel.create({
        phones: [generateSyrianPhone()],
        role: UserRole.DOCTOR,
        isActive: true,
      });

      // Plaintext value — the Doctor schema's pre('save') middleware
      // re-hashes with scrypt, matching the runtime `comparePassword` method.
      // Double-hashing with bcrypt first (the previous behaviour) produced
      // un-loginable accounts.
      const seededPlainPassword = seedPassword;
      const yearsOfExperience = 1 + Math.floor(Math.random() * 20);
      function sanitize(name: string): string {
        if (!name) throw new Error('الاسم فارغ.');

        let cleanName = name.replace(/[^a-zA-Zء-ي\s._-]/g, '').trim();

        // Force minimum 3 characters
        while (cleanName.length < 3) {
          cleanName += faker.person.firstName().slice(0, 3 - cleanName.length);
        }

        return cleanName;
      }

      const doctor = await doctorModel.create({
        authAccountId: new Types.ObjectId(),
        firstName: sanitize(faker.person.firstName()),
        middleName: sanitize(faker.person.middleName()),
        lastName: sanitize(faker.person.lastName()),
        password: seededPlainPassword,
        cityId: city._id,
        city: city.name,
        subcity: randomArea,
        publicSpecializationId: publicSpec._id,
        publicSpecialization: publicSpec.name,
        privateSpecializationId: privateSpec._id,
        privateSpecialization: privateSpec.name,
        phones: [{ normal: [generateSyrianPhone()], clinic: [], whatsup: [] }],
        hospitals: hospital
          ? [
              {
                id: hospital._id.toString(),
                name: hospital.name,
                location: hospital.address ?? '',
              },
            ]
          : [],
        centers: center
          ? [
              {
                id: center._id.toString(),
                name: center.name,
                location: center.address ?? '',
              },
            ]
          : [],
        insuranceCompanies: [],
        workingHours: [
          {
            day: Days.MONDAY,
            location: {
              type: WorkigEntity.CLINIC,
              entity_name: 'Main Clinic',
              address: faker.location.streetAddress(),
            },
            startTime: '09:00',
            endTime: '17:00',
          },
        ],
        gender: Math.random() > 0.5 ? Gender.MALE : Gender.FEMALE,
        rating: Math.floor(Math.random() * 5) + 1,
        status: ApprovalStatus.APPROVED,
        inspectionDuration: 30 + Math.floor(Math.random() * 31),
        inspectionPrice: 50 + Math.floor(Math.random() * 51),
        isSubscribed: false,
        maxSessions: 5,
        searchCount: 0,
        profileViews: 0,
        subscriptionId: undefined,

        image: faker.image.url(),
        certificateImage: faker.image.url(),
        licenseImage: faker.image.url(),
        yearsOfExperience,
      });

      console.log(
        `✅ Doctor ${createdCount + 1}: ${doctor.firstName} ${doctor.lastName} created`,
      );
      createdCount++;
    }

    console.log(`\n🎉 Total Doctors Seeded: ${createdCount}`);
    await app.close();
  }
}
