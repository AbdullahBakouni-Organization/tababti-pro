import * as dotenv from 'dotenv';
dotenv.config();

import { NestFactory } from '@nestjs/core';
import { DatabaseModule } from '../database.module';

import { CitySeeder } from './citiy.seeder';
import { SpecialtySeeder } from './spicility.seeder';
import seedHospitals from './hospital.seeder';
import { CenterSeeder } from './center.seeder';
import { DoctorSeeder } from './doctor.seeder';
//import { BookingSeeder } from './booking.seeder';

import { getModelToken } from '@nestjs/mongoose';
import { Hospital } from '../schemas/hospital.schema';
import { QuestionSeeder } from './question.seeder';
import { AnswerSeeder } from './answer.seeder';
import { PostSeeder } from './post.seeder';
import { UserSeeder } from './user.seeder';

async function runSeeders() {
  console.log('🚀 Starting all seeders...\n');

  const app = await NestFactory.createApplicationContext(DatabaseModule);

  try {
    // =====================================================
    // Cities
    // =====================================================
    console.log('🌍 Seeding Cities & SubCities...');
    const citySeeder = new CitySeeder(app);
    await citySeeder.seed();
    console.log('✅ Cities & SubCities seeded!\n');

    // =====================================================
    // Specialties
    // =====================================================
    console.log('📚 Seeding Specializations...');
    const specialtySeeder = new SpecialtySeeder(app);
    await specialtySeeder.seed();
    console.log('✅ Specializations seeded!\n');

    // =====================================================
    // Users (⭐ Add this)
    // =====================================================
    console.log('👥 Seeding Users...');
    const userSeeder = new UserSeeder(app);
    const users = await userSeeder.seed();
    console.log('✅ Users seeded!\n');


    // =====================================================
    // Hospitals (⭐ FIXED)
    // =====================================================
    console.log('🏥 Seeding Hospitals...');

    const hospitalModel = app.get(getModelToken(Hospital.name));
    const cityModel = app.get(getModelToken('Cities'));

    await hospitalModel.deleteMany({});

    // ⭐ جلب المدن مرة واحدة
    const cities = await cityModel.find().lean();

    const cityMap = new Map(
      cities.map((c: any) => [c.name, c._id])
    );

    const hospitalsToInsert = seedHospitals.map((h: any) => {
      const cityId = cityMap.get(h.cityName);

      if (!cityId) {
        throw new Error(`❌ City not found for hospital: ${h.name}`);
      }

      const { cityName, ...rest } = h;

      return {
        ...rest,
        cityId,
      };
    });

    await hospitalModel.insertMany(hospitalsToInsert);

    console.log('✅ Hospitals seeded!\n');

    // =====================================================
    // Posts
    // =====================================================
    console.log('📝 Seeding Posts...');
    const postSeeder = new PostSeeder(app);
    await postSeeder.seed();
    console.log('✅ Posts seeded!\n');

    // =====================================================
    // Centers
    // =====================================================
    console.log('🏢 Seeding Centers...');
    const centerSeeder = new CenterSeeder(app);
    await centerSeeder.seed();
    console.log('✅ Centers seeded!\n');

    // =====================================================
    // Doctors
    // =====================================================
    console.log('👨‍⚕️ Seeding Doctors...');
    const doctorSeeder = new DoctorSeeder(app);
    await doctorSeeder.seed();
    console.log('✅ Doctors seeded!\n');

    // =====================================================
    // Questions
    // =====================================================
    console.log('❓ Seeding Questions...');
    const questionSeeder = new QuestionSeeder(app);
    const questions = await questionSeeder.seed();
    console.log('✅ Questions seeded!\n');

    // =====================================================
    // Answers
    // =====================================================
    console.log('💬 Seeding Answers...');
    const answerSeeder = new AnswerSeeder(app);
    await answerSeeder.seed(questions);
    console.log('✅ Answers seeded!\n');


    // =====================================================
    // Bookings
    // =====================================================
    // console.log('🌱 Seeding Bookings...');
    // const bookingSeeder = app.get(BookingSeeder);
    // await bookingSeeder.seed();
    // console.log('✅ Bookings seeded!');

    console.log('🎉 All seeders completed successfully!');
  } catch (error) {
    console.error('❌ Seeder process failed:', error);
  } finally {
    await app.close();
    process.exit(0);
  }
}

runSeeders();
