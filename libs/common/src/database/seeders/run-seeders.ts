import * as dotenv from 'dotenv';
dotenv.config();

import { NestFactory } from '@nestjs/core';
import { DatabaseModule } from '../database.module';

// استيراد جميع seeders
import { CitySeeder } from './citiy.seeder';
import { SpecialtySeeder } from './spicility.seeder';
import { HospitalSeeder } from './hospital.seeder';
import { CenterSeeder } from './center.seeder';
import { DoctorSeeder } from './doctor.seeder';

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
    const hospitalSeeder = new HospitalSeeder(app);
    await hospitalSeeder.seed();
    console.log('✅ Hospitals seeded!\n');


    console.log('🏢 Seeding Centers...');
    const centerSeeder = new CenterSeeder(app); 
    await centerSeeder.seed();
    console.log('✅ Centers seeded!\n');


    console.log('👨‍⚕️ Seeding Doctors...');
    const doctorSeeder = new DoctorSeeder(app); 
    await doctorSeeder.seed();
    console.log('✅ Doctors seeded!\n');

    console.log('🎉 All seeders completed successfully!');
  } catch (error) {
    console.error('❌ Seeder process failed:', error);
  } finally {
    await app.close();
    process.exit(0); 
  }
}

runSeeders();
