import * as dotenv from 'dotenv';
dotenv.config();

import { NestFactory } from '@nestjs/core';
import { DatabaseModule } from '../database.module';

import { CitySeeder } from './citiy.seeder';
import { SpecialtySeeder } from './spicility.seeder';
import seedHospitals from './hospital.seeder';
import { CenterSeeder } from './center.seeder';
import { DoctorSeeder } from './doctor.seeder';
import { BookingSeeder } from './booking.seeder';
import { getModelToken } from '@nestjs/mongoose';
import { Hospital } from '../schemas/hospital.schema';

async function runSeeders() {
  console.log('🚀 Starting all seeders...\n');

  const app = await NestFactory.createApplicationContext(DatabaseModule);

  try {

    console.log('🌍 Seeding Cities & SubCities...');
    const citySeeder = new CitySeeder(app);
    await citySeeder.seed();
    console.log('✅ Cities & SubCities seeded!\n');


    console.log('📚 Seeding Specializations...');
    const specialtySeeder = new SpecialtySeeder(app);
    await specialtySeeder.seed();
    console.log('✅ Specializations seeded!\n');


    console.log('🏥 Seeding Hospitals...');
    const hospitalModel = app.get(getModelToken(Hospital.name));
    await hospitalModel.deleteMany({});
    for (const h of seedHospitals) {
      await hospitalModel.create(h);
    }
    console.log('✅ Hospitals seeded!\n');


    console.log('🏢 Seeding Centers...');
    const centerSeeder = new CenterSeeder(app);
    await centerSeeder.seed();
    console.log('✅ Centers seeded!\n');


    console.log('👨‍⚕️ Seeding Doctors...');
    const doctorSeeder = new DoctorSeeder(app);
    await doctorSeeder.seed();
    console.log('✅ Doctors seeded!\n');


    // 3️⃣ Seed Bookings
    const bookingSeeder = app.get(BookingSeeder);
    console.log('🌱 Seeding Bookings...');
    await bookingSeeder.seed();
    console.log('✅ Bookings seeded!');

    console.log('🎉 All seeders completed successfully!');
  } catch (error) {
    console.error('❌ Seeder process failed:', error);
  } finally {
    await app.close();
    process.exit(0);
  }
}

runSeeders();
