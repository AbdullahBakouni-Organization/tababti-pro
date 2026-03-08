import * as dotenv from 'dotenv';
dotenv.config();

import { NestFactory } from '@nestjs/core';
import { INestApplicationContext } from '@nestjs/common';
import { DatabaseModule } from '../database.module';
import { Model } from 'mongoose';
import { getModelToken } from '@nestjs/mongoose';

import { CitySeeder } from './citiy.seeder';
import { SpecialtySeeder } from './spicility.seeder';
import { CenterSeeder } from './center.seeder';
import { DoctorSeeder } from './doctor.seeder';
import { SlotSeeder } from './slot.seeder';
import { BookingSeeder } from './booking.seeder';
import { UserSeeder } from './user.seeder';
import { QuestionSeeder } from './question.seeder';
import { AnswerSeeder } from './answer.seeder';
import { PostSeeder } from './post.seeder';
import { CommonDepartmentSeeder } from './commonDepartment.seeder';
import { Hospital } from '../schemas/hospital.schema';
import { AuthAccount } from '../schemas/auth.schema';
import { Doctor } from '../schemas/doctor.schema';
import { User } from '../schemas/user.schema';
import seedHospitals from './hospital.seeder';

async function runSeeders() {
  console.log('🚀 Starting all seeders...\n');

  const app: INestApplicationContext =
    await NestFactory.createApplicationContext(DatabaseModule);

  try {
    // ✅ Step 1: Wipe dependent collections first (doctors, users), then authAccounts
    const authModel = app.get<Model<AuthAccount>>(getModelToken('AuthAccount'));
    const doctorModel = app.get<Model<Doctor>>(getModelToken('Doctor'));
    const userModel = app.get<Model<User>>(getModelToken('User'));

    await doctorModel.deleteMany({});
    await userModel.deleteMany({});
    await authModel.deleteMany({});
    console.log('🗑️  Cleared doctors, users, and all auth accounts\n');

    console.log('🌍 Seeding Cities...');
    const citySeeder = new CitySeeder(app);
    await citySeeder.seed();

    console.log('📚 Seeding Specialties...');
    const specialtySeeder = new SpecialtySeeder(app);
    await specialtySeeder.seed();

    console.log('👥 Seeding Users...');
    const userSeeder = new UserSeeder(app);
    await userSeeder.seed();

    console.log('🏥 Seeding Hospitals...');
    const hospitalModel = app.get(getModelToken(Hospital.name)) as Model<Hospital>;
    const cityModel = app.get(getModelToken('Cities')) as Model<any>;
    await hospitalModel.deleteMany({});
    const cities = await cityModel.find().lean();
    const cityMap = new Map(cities.map((c: any) => [c.name, c._id]));
    const hospitalsToInsert = seedHospitals.map((h: any) => {
      const cityId = cityMap.get(h.cityName);
      if (!cityId) throw new Error(`City not found for hospital: ${h.name}`);
      const { cityName, ...rest } = h;
      return { ...rest, cityId };
    });
    await hospitalModel.insertMany(hospitalsToInsert);
    console.log(`✅ Seeded ${hospitalsToInsert.length} hospitals`);

    console.log('📝 Seeding Posts...');
    const postSeeder = new PostSeeder(app);
    await postSeeder.seed();

    console.log('🏢 Seeding Centers...');
    const centerSeeder = new CenterSeeder(app);
    await centerSeeder.seed();

    console.log('👨‍⚕️ Seeding Doctors...');
    const doctorSeeder = new DoctorSeeder(app);
    await doctorSeeder.seed();

    console.log('📅 Seeding Slots...');
    const slotSeeder = new SlotSeeder(app);
    await slotSeeder.seed();

    console.log('📅 Seeding Bookings...');
    const bookingSeeder = new BookingSeeder(app);
    await bookingSeeder.seed();

    console.log('❓ Seeding Questions...');
    const questionSeeder = new QuestionSeeder(app);
    const questions = await questionSeeder.seed();

    console.log('💬 Seeding Answers...');
    const answerSeeder = new AnswerSeeder(app);
    await answerSeeder.seed(questions);

    console.log('🏥 Seeding Departments...');
    const departmentSeeder = new CommonDepartmentSeeder(app);
    await departmentSeeder.seed();

    console.log('\n🎉 All seeders completed successfully!');
  } catch (error) {
    console.error('❌ Seeder process failed:', error);
  } finally {
    await app.close();
    process.exit(0);
  }
}

runSeeders();