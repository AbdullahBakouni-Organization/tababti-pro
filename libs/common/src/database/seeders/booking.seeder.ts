import * as dotenv from 'dotenv';
dotenv.config();

import { INestApplicationContext } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { faker } from '@faker-js/faker';

import { Booking } from '../schemas/booking.schema';
import { Doctor } from '../schemas/doctor.schema';
import { User } from '../schemas/user.schema';
import { AppointmentSlot } from '../schemas/slot.schema';

import { BookingStatus, SlotStatus, UserRole } from '../schemas/common.enums';

export class BookingSeeder {
  constructor(private readonly app: INestApplicationContext) {}

  async seed() {
    console.log('🌱 Starting Booking Seeder...\n');

    const bookingModel = this.app.get(
      getModelToken(Booking.name),
    ) as Model<Booking>;

    const doctorModel = this.app.get(
      getModelToken(Doctor.name),
    ) as Model<Doctor>;

    const userModel = this.app.get(getModelToken(User.name)) as Model<User>;

    const slotModel = this.app.get(
      getModelToken(AppointmentSlot.name),
    ) as Model<AppointmentSlot>;

    // Cleanup
    await bookingModel.deleteMany({});
    console.log('🗑️ Cleared existing bookings\n');

    // Load required data
    const doctors = await doctorModel.find().lean().exec();
    const users = await userModel.find().lean().exec();
    const slots = await slotModel
      .find({ status: SlotStatus.AVAILABLE })
      .lean()
      .exec();

    if (!doctors.length || !users.length) {
      console.error('❌ Cannot seed bookings: No doctors or users found');
      return;
    }

    if (!slots.length) {
      console.error(
        '❌ Cannot seed bookings: No available slots found. Run SlotSeeder first.',
      );
      return;
    }

    console.log(
      `📊 Found ${doctors.length} doctors, ${users.length} users, ${slots.length} slots\n`,
    );

    // Build a doctor map for fast lookup
    const doctorMap = new Map(doctors.map((d: any) => [d._id.toString(), d]));

    let createdCount = 0;
    let skippedCount = 0;

    const shuffledSlots = [...slots].sort(() => Math.random() - 0.5);
    const targetCount = Math.min(100, shuffledSlots.length);

    for (let i = 0; i < targetCount; i++) {
      const slot = shuffledSlots[i];
      const user = users[Math.floor(Math.random() * users.length)];
      const doctor = doctorMap.get(slot.doctorId.toString());

      if (!doctor) {
        console.warn(`⚠️ No doctor found for slot ${slot._id}, skipping`);
        skippedCount++;
        continue;
      }

      const status = faker.helpers.arrayElement([
        BookingStatus.PENDING,
        BookingStatus.CONFIRMED,
        BookingStatus.COMPLETED,
        BookingStatus.CANCELLED_BY_PATIENT,
        BookingStatus.CANCELLED_BY_DOCTOR,
        BookingStatus.CANCELLED_BY_ADMIN,
        BookingStatus.CANCELLED_BY_SYSTEM,
      ]);

      const isCompleted = status === BookingStatus.COMPLETED;

      const isCancelled = [
        BookingStatus.CANCELLED_BY_PATIENT,
        BookingStatus.CANCELLED_BY_DOCTOR,
        BookingStatus.CANCELLED_BY_ADMIN,
        BookingStatus.CANCELLED_BY_SYSTEM,
      ].includes(status);

      try {
        const booking = await bookingModel.create({
          patientId: (user as any)._id,
          doctorId: slot.doctorId,
          slotId: (slot as any)._id,
          status,
          workingHoursVersion: slot.workingHoursVersion,
          bookingDate: slot.date,
          bookingTime: slot.startTime,
          bookingEndTime: slot.endTime,
          location: slot.location,
          price: slot.price ?? (doctor as any).inspectionPrice ?? 50,
          createdBy: faker.helpers.arrayElement([
            UserRole.USER,
            UserRole.DOCTOR,
          ]),
          isRated: isCompleted && faker.datatype.boolean(),
          ratingId:
            isCompleted && faker.datatype.boolean()
              ? new Types.ObjectId()
              : undefined,
          note: faker.datatype.boolean() ? faker.lorem.sentence() : undefined,
          completedAt: isCompleted
            ? faker.date.recent({ days: 10 })
            : undefined,
          cancellation: isCancelled
            ? {
                cancelledBy:
                  status === BookingStatus.CANCELLED_BY_PATIENT
                    ? UserRole.USER
                    : status === BookingStatus.CANCELLED_BY_DOCTOR
                      ? UserRole.DOCTOR
                      : UserRole.SYSTEM,
                reason: faker.helpers.arrayElement([
                  'Patient requested cancellation',
                  'Doctor unavailable',
                  'Schedule conflict',
                  'Emergency',
                ]),
                cancelledAt: faker.date.recent({ days: 5 }),
              }
            : undefined,
        });

        // Update the slot status to BOOKED for non-cancelled/pending bookings
        if (
          status === BookingStatus.CONFIRMED ||
          status === BookingStatus.COMPLETED
        ) {
          await slotModel.findByIdAndUpdate((slot as any)._id, {
            status: SlotStatus.BOOKED,
            patientId: (user as any)._id,
            bookingId: booking._id,
            bookedAt: new Date(),
          });
        }

        createdCount++;
        console.log(
          `✅ Booking ${createdCount}: ${(user as any).username ?? (user as any)._id} → Dr. ${
            (doctor as any).firstName
          } ${(doctor as any).lastName} [${slot.startTime}-${slot.endTime}] (${status})`,
        );
      } catch (err: any) {
        // Skip duplicate bookings (unique index violation)
        if (err?.code === 11000) {
          console.warn(`⚠️ Duplicate booking skipped for slot ${slot._id}`);
          skippedCount++;
        } else {
          console.error(
            `❌ Failed to create booking for slot ${slot._id}:`,
            err.message,
          );
          skippedCount++;
        }
      }
    }

    console.log(`\n🎉 Total Bookings Seeded: ${createdCount}`);
    if (skippedCount > 0) {
      console.log(`⚠️ Skipped: ${skippedCount}`);
    }
  }
}
