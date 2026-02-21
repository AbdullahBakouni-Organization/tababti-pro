import * as dotenv from 'dotenv';
dotenv.config();

import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { faker } from '@faker-js/faker';
import { DatabaseModule } from '../database.module';
import { Booking } from '../schemas/booking.schema';
import { Doctor } from '../schemas/doctor.schema';
import { User } from '../schemas/user.schema';
import { BookingStatus, UserRole, WorkigEntity } from '../schemas/common.enums';

export class BookingSeeder {
  async seed() {
    console.log('🌱 Starting Booking Seeder...\n');

    const app = await NestFactory.createApplicationContext(DatabaseModule);

    const bookingModel = app.get<Model<Booking>>(getModelToken(Booking.name));
    const doctorModel = app.get<Model<Doctor>>(getModelToken(Doctor.name));
    const userModel = app.get<Model<User>>(getModelToken(User.name));

    await bookingModel.deleteMany({});
    console.log('🗑️  Cleared existing bookings\n');

    const doctors = await doctorModel.find();
    const users = await userModel.find();

    if (!doctors.length || !users.length) {
      console.error('❌ Cannot seed bookings: No doctors or users found');
      await app.close();
      return;
    }

    let createdCount = 0;

    for (let i = 0; i < 100; i++) {
      const doctor = doctors[Math.floor(Math.random() * doctors.length)];
      const user = users[Math.floor(Math.random() * users.length)];

      const bookingDate = faker.date.soon({ days: 30 });

      const startHour = 9 + Math.floor(Math.random() * 8);
      const startMinute = Math.random() > 0.5 ? 0 : 30;
      const bookingTime = `${startHour.toString().padStart(2, '0')}:${startMinute
        .toString()
        .padStart(2, '0')}`;
      const bookingEndTime = `${(startHour + 1).toString().padStart(2, '0')}:${startMinute
        .toString()
        .padStart(2, '0')}`;

      const location = {
        type: WorkigEntity.CLINIC,
        entity_name: faker.company.name(),
        address: faker.location.streetAddress(),
      };

      await bookingModel.create({
        userId: user._id,
        doctorId: doctor._id,
        slotId: new Types.ObjectId(),
        status: faker.helpers.arrayElement([
          BookingStatus.PENDING,
          BookingStatus.CONFIRMED,
          BookingStatus.COMPLETED,
          BookingStatus.CANCELLED_BY_PATIENT,
          BookingStatus.CANCELLED_BY_DOCTOR,
          BookingStatus.CANCELLED_BY_ADMIN,
          BookingStatus.CANCELLED_BY_SYSTEM,
        ]),
        bookingDate,
        bookingTime,
        bookingEndTime,
        location,
        price: 50 + Math.floor(Math.random() * 100),
        createdBy: faker.helpers.arrayElement([UserRole.USER, UserRole.DOCTOR]),
        isRated: faker.datatype.boolean(),
        ratingId: faker.datatype.boolean() ? new Types.ObjectId() : undefined,
        note: faker.datatype.boolean() ? faker.lorem.sentence() : undefined,
        completedAt:
          faker.datatype.boolean() && Math.random() > 0.5
            ? faker.date.soon({ days: 10 })
            : undefined,
      });

      createdCount++;
    }

    console.log(`🎉 Total Bookings Seeded: ${createdCount}`);
    await app.close();
  }
}

(async () => {
  const seeder = new BookingSeeder();
  await seeder.seed();
})();
