import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import { DateTime } from 'luxon';
import {
  AppointmentSlot,
  AppointmentSlotDocument,
} from '@app/common/database/schemas/slot.schema';
import {
  BookingStatus,
  Days,
  SlotStatus,
  WorkigEntity,
} from '@app/common/database/schemas/common.enums';
import {
  Booking,
  BookingDocument,
} from '@app/common/database/schemas/booking.schema';

export interface WorkingHoursUpdateJobData {
  doctorId: string;
  oldWorkingHours: Array<{
    day: Days;
    location: {
      type: WorkigEntity;
      entity_name: string;
      address: string;
    };
    startTime: string;
    endTime: string;
  }>;
  inspectionDuration: number;
  newWorkingHours: Array<{
    day: Days;
    location: {
      type: WorkigEntity;
      entity_name: string;
      address: string;
    };
    startTime: string;
    endTime: string;
  }>;
  version: number;
  updatedDays: Array<Days>;
}

export interface WorkingHourRange {
  day: Days;
  location: {
    type: WorkigEntity;
    entity_name: string;
    address: string;
  };
  startTime: string;
  endTime: string;
}

@Processor('WORKING_HOURS_UPDATE')
export class WorkingHoursUpdateProcessor {
  private readonly logger = new Logger(WorkingHoursUpdateProcessor.name);

  constructor(
    @InjectModel(AppointmentSlot.name)
    private slotModel: Model<AppointmentSlotDocument>,
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(Booking.name) private bookingModel: Model<BookingDocument>,
  ) {}

  /**
   * JOB A: Handle immediate (today) conflicts
   * Runs immediately after doctor confirms update
   */
  @Process('PROCESS_WORKING_HOURS_UPDATE')
  async processWorkingHoursUpdate(
    job: Job<WorkingHoursUpdateJobData>,
  ): Promise<void> {
    const {
      doctorId,
      oldWorkingHours,
      newWorkingHours,
      inspectionDuration,
      version,
      updatedDays,
    } = job.data;

    const doctorObjectId = new Types.ObjectId(doctorId);

    this.logger.log(`begining of PROCESS_WORKING_HOURS_UPDATE`);
    this.logger.log(`Updated Days: ${JSON.stringify(updatedDays)}`);

    for (const day of updatedDays) {
      await this.processSingleDay(
        doctorObjectId,
        day,
        oldWorkingHours,
        newWorkingHours,
        version,
        inspectionDuration,
      );
    }
  }

  private async processSingleDay(
    doctorId: Types.ObjectId,
    day: Days,
    oldWH: WorkingHourRange[],
    newWH: WorkingHourRange[],
    version: number,
    duration: number,
  ) {
    const session = await this.connection.startSession();
    session.startTransaction();

    try {
      const futureDates = this.getNext12WeeksDatesForDay(day);
      console.log('oldWH', oldWH);
      console.log('newWH', newWH);
      console.log('futureDates', futureDates);
      const validRanges = newWH.filter((w) => w.day === day);

      for (const date of futureDates) {
        const oldSlots = await this.slotModel
          .find({
            doctorId,
            date,
            status: { $ne: SlotStatus.INVALIDATED },
          })
          .session(session);

        for (const slot of oldSlots) {
          if (!this.slotFitsRanges(slot, validRanges)) {
            if (slot.status === SlotStatus.BOOKED) {
              await this.bookingModel.updateOne(
                { slotId: slot._id },
                { status: BookingStatus.NEEDS_RESCHEDULE },
                { session },
              );
            }

            slot.status = SlotStatus.INVALIDATED;
            await slot.save({ session });
          }
        }

        await this.generateNewSlotsForDate(
          doctorId,
          date,
          validRanges,
          version,
          duration,
          session,
        );
      }

      await session.commitTransaction();
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      await session.endSession();
    }
  }

  private async generateNewSlotsForDate(
    doctorId: Types.ObjectId,
    date: Date,
    ranges: WorkingHourRange[],
    version: number,
    duration: number,
    session: ClientSession,
  ) {
    for (const range of ranges) {
      const generatedSlots = this.buildSlotsFromRange(
        doctorId,
        date,
        range.startTime,
        range.endTime,
        range.day,
        range.location,
        duration,
        version,
      );

      for (const slot of generatedSlots) {
        const exists = await this.slotModel
          .findOne({
            doctorId,
            date,
            startTime: slot.startTime,
            status: { $ne: SlotStatus.INVALIDATED },
          })
          .session(session);

        if (!exists) {
          await this.slotModel.create([slot], { session });
        }
      }
    }
  }

  // private getNext12WeeksDatesForDay(day: string): Date[] {
  //   const dates: Date[] = [];

  //   const dayMap: Record<string, number> = {
  //     Sunday: 0,
  //     Monday: 1,
  //     Tuesday: 2,
  //     Wednesday: 3,
  //     Thursday: 4,
  //     Friday: 5,
  //     Saturday: 6,
  //   };

  //   const targetDay = dayMap[day];
  //   if (targetDay === undefined) return [];

  //   const now = new Date();
  //   const currentDay = now.getDay();

  //   const diff = (targetDay - currentDay + 7) % 7;
  //   const firstOccurrence = new Date(now);
  //   firstOccurrence.setDate(now.getDate() + diff);

  //   for (let i = 0; i < 12; i++) {
  //     const date = new Date(firstOccurrence);
  //     date.setDate(firstOccurrence.getDate() + i * 7);
  //     date.setHours(0, 0, 0, 0);
  //     dates.push(date);
  //   }

  //   return dates;
  // }

  private getNext12WeeksDatesForDay(day: string): Date[] {
    const dayMap = {
      Sunday: 7,
      Monday: 1,
      Tuesday: 2,
      Wednesday: 3,
      Thursday: 4,
      Friday: 5,
      Saturday: 6,
    };

    const target = dayMap[day];

    let dt = DateTime.now().setZone('Asia/Damascus').startOf('day');

    while (dt.weekday !== target) {
      dt = dt.plus({ days: 1 });
    }

    const dates: Date[] = [];

    for (let i = 0; i < 12; i++) {
      dates.push(dt.plus({ weeks: i }).toUTC().toJSDate());
    }

    return dates;
  }
  private slotFitsRanges(
    slot: AppointmentSlotDocument,
    ranges: WorkingHourRange[],
  ): boolean {
    const slotStart = this.timeToMinutes(slot.startTime);
    const slotEnd = this.timeToMinutes(slot.endTime);

    for (const range of ranges) {
      const rangeStart = this.timeToMinutes(range.startTime);
      const rangeEnd = this.timeToMinutes(range.endTime);

      if (slotStart >= rangeStart && slotEnd <= rangeEnd) {
        return true;
      }
    }

    return false;
  }

  private timeToMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }

  private minutesToTime(minutes: number): string {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;

    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  }
  private buildSlotsFromRange(
    doctorId: Types.ObjectId,
    date: Date,
    startTime: string,
    endTime: string,
    dayOfWeek: Days,
    location: {
      type: WorkigEntity;
      entity_name: string;
      address: string;
    },
    duration: number,
    version: number,
  ): Partial<AppointmentSlotDocument>[] {
    const slots: Partial<AppointmentSlotDocument>[] = [];

    let startMinutes = this.timeToMinutes(startTime);
    const endMinutes = this.timeToMinutes(endTime);

    while (startMinutes + duration <= endMinutes) {
      const slotStart = this.minutesToTime(startMinutes);
      const slotEnd = this.minutesToTime(startMinutes + duration);

      slots.push({
        doctorId,
        date,
        startTime: slotStart,
        endTime: slotEnd,
        status: SlotStatus.AVAILABLE,
        workingHoursVersion: version,
        duration: duration,
        dayOfWeek: dayOfWeek,
        location: location,
      });

      startMinutes += duration;
    }

    return slots;
  }
}
