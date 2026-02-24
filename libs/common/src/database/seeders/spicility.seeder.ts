import * as dotenv from 'dotenv';
dotenv.config();

import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { DatabaseModule } from '../database.module';
import {
  GeneralSpecialty,
  PrivateMedicineSpecialty,
} from '../schemas/common.enums';

// ---------------------------------------------------------
// 1. Defined Mapping: Links Public Enum -> Private Enum[]
// ---------------------------------------------------------
export const SpecialtyMapping: Record<
  GeneralSpecialty,
  PrivateMedicineSpecialty[]
> = {
  [GeneralSpecialty.HumanMedicine]: [
    PrivateMedicineSpecialty.GeneralPractitioner,
    PrivateMedicineSpecialty.InternalMedicine,
    PrivateMedicineSpecialty.GeneralSurgery,
    PrivateMedicineSpecialty.Pediatrics,
    PrivateMedicineSpecialty.ObstetricsGynecology,
    PrivateMedicineSpecialty.Cardiology,
    PrivateMedicineSpecialty.Orthopedics,
    PrivateMedicineSpecialty.Neurology,
    PrivateMedicineSpecialty.Dermatology,
    PrivateMedicineSpecialty.Ophthalmology,
    PrivateMedicineSpecialty.Otolaryngology,
    PrivateMedicineSpecialty.Anesthesia,
    PrivateMedicineSpecialty.Radiology,
    PrivateMedicineSpecialty.Emergency,
    PrivateMedicineSpecialty.Oncology,
    PrivateMedicineSpecialty.Nephrology,
    PrivateMedicineSpecialty.Pulmonology,
    PrivateMedicineSpecialty.Gastroenterology,
    PrivateMedicineSpecialty.VascularSurgery,
    PrivateMedicineSpecialty.Endocrinology,
    PrivateMedicineSpecialty.Neurosurgery,
  ],
  [GeneralSpecialty.Dentistry]: [
    PrivateMedicineSpecialty.GeneralDentistry,
    PrivateMedicineSpecialty.Orthodontics,
    PrivateMedicineSpecialty.OralMaxillofacialSurgery,
    PrivateMedicineSpecialty.Endodontics,
    PrivateMedicineSpecialty.PediatricDentistry,
    PrivateMedicineSpecialty.FixedProsthodontics,
    PrivateMedicineSpecialty.RemovableProsthodontics,
    PrivateMedicineSpecialty.Implantology,
    PrivateMedicineSpecialty.Periodontics,
  ],
  [GeneralSpecialty.Psychiatry]: [
    PrivateMedicineSpecialty.GeneralPsychiatry,
    PrivateMedicineSpecialty.DepressionTreatment,
    PrivateMedicineSpecialty.AnxietyTreatment,
    PrivateMedicineSpecialty.AddictionTreatment,
    PrivateMedicineSpecialty.ChildPsychiatry,
  ],
  [GeneralSpecialty.Veterinary]: [
    PrivateMedicineSpecialty.GeneralVeterinary,
    PrivateMedicineSpecialty.Pets,
    PrivateMedicineSpecialty.Livestock,
    PrivateMedicineSpecialty.Poultry,
  ],
  [GeneralSpecialty.Physiotherapy]: [
    PrivateMedicineSpecialty.InjuryTreatment,
    PrivateMedicineSpecialty.Rehabilitation,
    PrivateMedicineSpecialty.SportsPhysiotherapy,
    PrivateMedicineSpecialty.NeurologicalPhysiotherapy,
    PrivateMedicineSpecialty.GeriatricPhysiotherapy,
  ],
};

// ---------------------------------------------------------
// 2. Main Seed Function
// ---------------------------------------------------------
export class SpecialtySeeder {
  constructor(private app) {}
  async seed() {
    console.log('🌱 Starting Specialization Seed...\n');

    const app = await NestFactory.createApplicationContext(DatabaseModule);

    // Get Models
    const PublicSpecialization = app.get(getModelToken('PublicSpecialization'));
    const PrivateSpecialization = app.get(
      getModelToken('PrivateSpecialization'),
    );

    // 1. Clear Existing Data
    console.log('🗑️  Clearing existing specializations...');
    await PublicSpecialization.deleteMany({});
    await PrivateSpecialization.deleteMany({});
    console.log('✅ Data cleared\n');

    // 2. Loop through the Mapping and Seed
    console.log('📚 Creating Specializations...');

    let publicCount = 0;
    let privateCount = 0;

    // We iterate over the Mapping keys (GeneralSpecialties)
    for (const generalKey of Object.keys(SpecialtyMapping)) {
      // Cast key to Enum type
      const publicEnum = generalKey as GeneralSpecialty;
      const privateEnums = SpecialtyMapping[publicEnum];

      // A. Create the Public Document
      // The value of 'publicEnum' is the Arabic string (e.g., 'طب_بشري')
      const publicDoc = await PublicSpecialization.create({
        name: publicEnum,
      });
      publicCount++;

      // B. Create the Private Documents linked to Public ID
      if (privateEnums && privateEnums.length > 0) {
        const privateDocsPayload = privateEnums.map((privateVal) => ({
          name: privateVal, // Arabic string (e.g., 'قلب')
          publicSpecializationId: publicDoc._id,
        }));

        await PrivateSpecialization.insertMany(privateDocsPayload);
        privateCount += privateDocsPayload.length;
      }
    }

    // 3. Summary
    console.log('\n🎉 Seeding Complete!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📚 Public Specializations Created: ${publicCount}`);
    console.log(`📖 Private Specializations Created: ${privateCount}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    await app.close();
  }
}
