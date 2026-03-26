// import * as dotenv from 'dotenv';
// dotenv.config();

// import { NestFactory } from '@nestjs/core';
// import { getModelToken } from '@nestjs/mongoose';
// import { DatabaseModule } from '../database.module';

// import {
//   GeneralSpecialty,
//   PrivateMedicineSpecialty,
// } from '../schemas/common.enums';

// // ---------------------------------------------------------
// // 1. Mapping
// // ---------------------------------------------------------
// export const SpecialtyMapping: Record<
//   GeneralSpecialty,
//   PrivateMedicineSpecialty[]
// > = {
//   [GeneralSpecialty.HumanMedicine]: [
//     PrivateMedicineSpecialty.GeneralPractitioner,
//     PrivateMedicineSpecialty.InternalMedicine,
//     PrivateMedicineSpecialty.GeneralSurgery,
//     PrivateMedicineSpecialty.Pediatrics,
//     PrivateMedicineSpecialty.ObstetricsGynecology,
//     PrivateMedicineSpecialty.Cardiology,
//     PrivateMedicineSpecialty.Orthopedics,
//     PrivateMedicineSpecialty.Neurology,
//     PrivateMedicineSpecialty.Dermatology,
//     PrivateMedicineSpecialty.Ophthalmology,
//     PrivateMedicineSpecialty.Otolaryngology,
//     PrivateMedicineSpecialty.Anesthesia,
//     PrivateMedicineSpecialty.Radiology,
//     PrivateMedicineSpecialty.Emergency,
//     PrivateMedicineSpecialty.Oncology,
//     PrivateMedicineSpecialty.Nephrology,
//     PrivateMedicineSpecialty.Pulmonology,
//     PrivateMedicineSpecialty.Gastroenterology,
//     PrivateMedicineSpecialty.VascularSurgery,
//     PrivateMedicineSpecialty.Endocrinology,
//     PrivateMedicineSpecialty.Neurosurgery,
//   ],
//   [GeneralSpecialty.Dentistry]: [
//     PrivateMedicineSpecialty.GeneralDentistry,
//     PrivateMedicineSpecialty.Orthodontics,
//     PrivateMedicineSpecialty.OralMaxillofacialSurgery,
//     PrivateMedicineSpecialty.Endodontics,
//     PrivateMedicineSpecialty.PediatricDentistry,
//     PrivateMedicineSpecialty.FixedProsthodontics,
//     PrivateMedicineSpecialty.RemovableProsthodontics,
//     PrivateMedicineSpecialty.Implantology,
//     PrivateMedicineSpecialty.Periodontics,
//   ],
//   [GeneralSpecialty.Psychiatry]: [
//     PrivateMedicineSpecialty.GeneralPsychiatry,
//     PrivateMedicineSpecialty.DepressionTreatment,
//     PrivateMedicineSpecialty.AnxietyTreatment,
//     PrivateMedicineSpecialty.AddictionTreatment,
//     PrivateMedicineSpecialty.ChildPsychiatry,
//   ],
//   [GeneralSpecialty.Veterinary]: [
//     PrivateMedicineSpecialty.GeneralVeterinary,
//     PrivateMedicineSpecialty.Pets,
//     PrivateMedicineSpecialty.Livestock,
//     PrivateMedicineSpecialty.Poultry,
//   ],
//   [GeneralSpecialty.Physiotherapy]: [
//     PrivateMedicineSpecialty.InjuryTreatment,
//     PrivateMedicineSpecialty.Rehabilitation,
//     PrivateMedicineSpecialty.SportsPhysiotherapy,
//     PrivateMedicineSpecialty.NeurologicalPhysiotherapy,
//     PrivateMedicineSpecialty.GeriatricPhysiotherapy,
//   ],
// };

// // ---------------------------------------------------------
// // 2. Seeder Class
// // ---------------------------------------------------------
// class SpecialtySeeder {
//   async seed() {
//     console.log('🌱 Starting Specialization Seed...\n');

//     const app = await NestFactory.createApplicationContext(DatabaseModule);

//     try {
//       const PublicSpecialization = app.get(
//         getModelToken('PublicSpecialization'),
//       );
//       const PrivateSpecialization = app.get(
//         getModelToken('PrivateSpecialization'),
//       );

//       // Clear data
//       console.log('🗑️  Clearing existing specializations...');
//       await PublicSpecialization.deleteMany({});
//       await PrivateSpecialization.deleteMany({});
//       console.log('✅ Data cleared\n');

//       console.log('📚 Creating Specializations...');

//       let publicCount = 0;
//       let privateCount = 0;

//       for (const generalKey of Object.keys(SpecialtyMapping)) {
//         const publicEnum = generalKey as GeneralSpecialty;
//         const privateEnums = SpecialtyMapping[publicEnum];

//         // Create public
//         const publicDoc = await PublicSpecialization.create({
//           name: publicEnum,
//         });
//         publicCount++;

//         console.log(`✅ Public: ${publicDoc.name}`);

//         // Create private
//         if (privateEnums && privateEnums.length > 0) {
//           const payload = privateEnums.map((privateVal) => ({
//             name: privateVal,
//             publicSpecializationId: publicDoc._id,
//           }));

//           await PrivateSpecialization.insertMany(payload);
//           privateCount += payload.length;
//         }
//       }

//       console.log('\n🎉 Seeding Complete!');
//       console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
//       console.log(`📚 Public Specializations: ${publicCount}`);
//       console.log(`📖 Private Specializations: ${privateCount}`);
//       console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
//     } catch (error) {
//       console.error('❌ Seeder failed:', error);
//     } finally {
//       await app.close();
//     }
//   }
// }

// // ---------------------------------------------------------
// // 3. Bootstrap (THIS WAS MISSING)
// // ---------------------------------------------------------
// async function bootstrap() {
//   const seeder = new SpecialtySeeder();
//   await seeder.seed();
// }

// bootstrap()
//   .then(() => {
//     console.log('✅ Seeder finished successfully');
//     process.exit(0);
//   })
//   .catch((err) => {
//     console.error('❌ Seeder crashed:', err);
//     process.exit(1);
//   });
