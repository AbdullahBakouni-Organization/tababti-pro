import * as dotenv from 'dotenv';
dotenv.config();

import { INestApplicationContext } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { faker } from '@faker-js/faker';

import { Doctor } from '../schemas/doctor.schema';
import { AppointmentSlot } from '../schemas/slot.schema';
import { Days, SlotStatus, WorkigEntity } from '../schemas/common.enums';

const DAY_MAP: Record<string, Days> = {
  Monday: Days.MONDAY,
  Tuesday: Days.TUESDAY,
  Wednesday: Days.WEDNESDAY,
  Thursday: Days.THURSDAY,
  Friday: Days.FRIDAY,
  Saturday: Days.SATURDAY,
  Sunday: Days.SUNDAY,
};

function getNextDateForDay(dayName: Days): Date {
  const dayIndexMap: Record<Days, number> = {
    [Days.SUNDAY]: 0,
    [Days.MONDAY]: 1,
    [Days.TUESDAY]: 2,
    [Days.WEDNESDAY]: 3,
    [Days.THURSDAY]: 4,
    [Days.FRIDAY]: 5,
    [Days.SATURDAY]: 6,
  };

  const now = new Date();
  const todayUTC = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      0,
      0,
      0,
      0,
    ),
  );

  const targetDay = dayIndexMap[dayName];
  const currentDay = todayUTC.getUTCDay();
  let daysUntilTarget = targetDay - currentDay;
  if (daysUntilTarget <= 0) daysUntilTarget += 7;

  const result = new Date(todayUTC);
  result.setUTCDate(todayUTC.getUTCDate() + daysUntilTarget);
  // يرجع: 2026-03-16T00:00:00.000Z ← صحيح
  return result;
}

function generateTimeSlots(
  startTime: string,
  endTime: string,
  durationMinutes: number,
): { start: string; end: string }[] {
  const slots: { start: string; end: string }[] = [];

  const [startH, startM] = startTime.split(':').map(Number);
  const [endH, endM] = endTime.split(':').map(Number);

  let currentMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  while (currentMinutes + durationMinutes <= endMinutes) {
    const startHour = Math.floor(currentMinutes / 60);
    const startMin = currentMinutes % 60;
    const endSlotMinutes = currentMinutes + durationMinutes;
    const endHour = Math.floor(endSlotMinutes / 60);
    const endMin = endSlotMinutes % 60;

    slots.push({
      start: `${String(startHour).padStart(2, '0')}:${String(startMin).padStart(2, '0')}`,
      end: `${String(endHour).padStart(2, '0')}:${String(endMin).padStart(2, '0')}`,
    });

    currentMinutes += durationMinutes;
  }

  return slots;
}

export class SlotSeeder {
  constructor(private readonly app: INestApplicationContext) {}

  async seed() {
    console.log('🌱 Starting Slot Seeder...\n');

    const slotModel = this.app.get(
      getModelToken(AppointmentSlot.name),
    ) as Model<AppointmentSlot>;

    const doctorModel = this.app.get(
      getModelToken(Doctor.name),
    ) as Model<Doctor>;

    // Cleanup
    await slotModel.deleteMany({});
    console.log('🗑️ Cleared existing slots\n');

    const doctors = await doctorModel.find().lean().exec();

    if (!doctors.length) {
      console.error('❌ Cannot seed slots: No doctors found');
      return;
    }

    console.log(`📊 Found ${doctors.length} doctors\n`);

    let totalCreated = 0;
    const slotsToInsert: Partial<AppointmentSlot>[] = [];

    for (const doctor of doctors) {
      if (!doctor.workingHours?.length) {
        console.warn(
          `⚠️ Doctor ${doctor.firstName} has no working hours, skipping`,
        );
        continue;
      }

      const durationMinutes = doctor.inspectionDuration ?? 30;
      const price = doctor.inspectionPrice ?? 50;

      for (const wh of doctor.workingHours) {
        const dayEnum = DAY_MAP[wh.day] ?? wh.day;
        const slotDate = getNextDateForDay(dayEnum);
        const timeSlots = generateTimeSlots(
          wh.startTime,
          wh.endTime,
          durationMinutes,
        );

        for (const timeSlot of timeSlots) {
          slotsToInsert.push({
            doctorId: new Types.ObjectId((doctor as any)._id.toString()),
            status: SlotStatus.AVAILABLE,
            workingHoursVersion: doctor.workingHoursVersion ?? 1,
            date: slotDate,
            startTime: timeSlot.start,
            endTime: timeSlot.end,
            dayOfWeek: dayEnum,
            duration: durationMinutes,
            location: {
              type: wh.location?.type ?? WorkigEntity.CLINIC,
              entity_name: wh.location?.entity_name ?? 'Main Clinic',
              address: wh.location?.address ?? doctor.address ?? 'Unknown',
            },
            price,
            doctorInfo: {
              fullName:
                `${doctor.firstName} ${doctor.middleName ?? ''} ${doctor.lastName}`.trim(),
            },
            isRecurring: true,
            maxCapacity: 1,
            currentBookings: 0,
            allowOverbooking: false,
            overbookingLimit: 0,
            isOnline: false,
            autoConfirm: true,
            sendReminders: true,
            viewCount: 0,
            bookingAttempts: 0,
            holdDurationMinutes: 15,
            cancellationCount: 0,
            version: 1,
          });
        }
      }

      console.log(
        `✅ Prepared slots for Dr. ${doctor.firstName} ${doctor.lastName} (${doctor.workingHours.length} working days)`,
      );
    }

    // Bulk insert with duplicate handling
    if (slotsToInsert.length > 0) {
      try {
        const result = await slotModel.insertMany(slotsToInsert, {
          ordered: false, // Continue on duplicate key errors
        });
        totalCreated = result.length;
      } catch (err: any) {
        // insertMany with ordered:false throws but still inserts non-duplicates
        totalCreated = err?.result?.nInserted ?? 0;
        const duplicates = err?.writeErrors?.length ?? 0;
        if (duplicates > 0) {
          console.warn(`⚠️ Skipped ${duplicates} duplicate slots`);
        }
      }
    }

    console.log(`\n🎉 Total Slots Seeded: ${totalCreated}`);
    return totalCreated;
  }
}
