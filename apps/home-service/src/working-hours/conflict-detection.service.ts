import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BookingStatus } from '@app/common/database/schemas/common.enums';
import { ConflictedBooking } from './dto/update-working-hours.dto';
import {
  Booking,
  BookingDocument,
} from '@app/common/database/schemas/booking.schema';

@Injectable()
export class ConflictDetectionService {
  private readonly logger = new Logger(ConflictDetectionService.name);

  constructor(
    @InjectModel(Booking.name)
    private appointmentModel: Model<BookingDocument>,
    // @InjectModel(AppointmentSlot.name)
    // private slotModel: Model<AppointmentSlotDocument>,
  ) {}

  /**
   * Get Syria date (same as your slot generation service)
   */
  private getSyriaDate(): Date {
    const now = new Date();
    const SYRIA_OFFSET_MINUTES = 3 * 60;
    const utcTime = now.getTime() + now.getTimezoneOffset() * 60 * 1000;
    const syriaTime = new Date(utcTime + SYRIA_OFFSET_MINUTES * 60 * 1000);
    syriaTime.setHours(0, 0, 0, 0);
    return syriaTime;
  }

  /**
   * Detect conflicts between new working hours and existing bookings
   */
  async detectConflicts(
    doctorId: string,
    newWorkingHours: any[],
  ): Promise<{
    todayConflicts: ConflictedBooking[];
    futureConflicts: ConflictedBooking[];
  }> {
    const today = this.getSyriaDate();
    const endDate = new Date(today);
    endDate.setDate(today.getDate() + 84); // 12 weeks

    // Get all active bookings for this doctor
    const bookings = await this.appointmentModel
      .find({
        doctorId,
        status: {
          $in: [BookingStatus.PENDING, BookingStatus.COMPLETED],
        },
        bookingDate: { $gte: today, $lte: endDate },
      })
      .populate('patientId', 'username phone')
      .populate('slotId')
      .lean()
      .exec();

    const todayConflicts: ConflictedBooking[] = [];
    const futureConflicts: ConflictedBooking[] = [];

    for (const booking of bookings) {
      const conflict = this.checkBookingConflict(booking, newWorkingHours);

      if (conflict) {
        const isToday = this.isSameDay(booking.bookingDate, today);

        const patient =
          typeof booking.patientId === 'object' &&
          'username' in booking.patientId
            ? booking.patientId
            : null;

        if (!patient) continue;

        const slot =
          typeof booking.slotId === 'object' && 'startTime' in booking.slotId
            ? booking.slotId
            : null;

        if (!slot) continue;

        const conflictedBooking: ConflictedBooking = {
          bookingId: booking._id.toString(),
          patientId: booking.patientId._id.toString(),
          patientName: patient.username,
          patientContact: patient.phone,
          appointmentDate: booking.bookingDate,
          appointmentTime: slot.startTime,
          location: slot.location,
          reason: conflict.reason,
          isToday,
        };

        if (isToday) {
          todayConflicts.push(conflictedBooking);
        } else {
          futureConflicts.push(conflictedBooking);
        }
      }
    }

    this.logger.log(
      `Conflict detection for doctor ${doctorId}: ${todayConflicts.length} today, ${futureConflicts.length} future`,
    );

    return { todayConflicts, futureConflicts };
  }

  /**
   * Check if a booking conflicts with new working hours
   */
  private checkBookingConflict(
    booking: BookingDocument,
    newWorkingHours: any[],
  ): { conflicts: boolean; reason: string } | null {
    const slotschema =
      typeof booking.slotId === 'object' && 'startTime' in booking.slotId
        ? booking.slotId
        : null;

    if (!slotschema) return null;
    const bookingDay = slotschema.dayOfWeek;
    const bookingLocation = slotschema.location;
    const bookingStartTime = slotschema.startTime;
    const bookingEndTime = slotschema.endTime;

    // Find matching working hours for this day and location
    const matchingWorkingHours = newWorkingHours.filter(
      (wh) =>
        wh.day.toLowerCase() === bookingDay.toLowerCase() &&
        wh.location.type === bookingLocation.type &&
        wh.location.entity_name === bookingLocation.entity_name,
    );

    // If no working hours for this day/location, it's a conflict
    if (matchingWorkingHours.length === 0) {
      return {
        conflicts: true,
        reason: `Doctor no longer works on ${bookingDay} at ${bookingLocation.entity_name}`,
      };
    }

    // Check if booking time falls within any of the new working hour ranges
    const isWithinWorkingHours = matchingWorkingHours.some((wh) => {
      return this.isTimeWithinRange(
        bookingStartTime,
        bookingEndTime,
        wh.startTime,
        wh.endTime,
      );
    });

    if (!isWithinWorkingHours) {
      return {
        conflicts: true,
        reason: `Appointment time ${bookingStartTime}-${bookingEndTime} is outside new working hours`,
      };
    }

    return null;
  }

  /**
   * Check if appointment time is within working hours range
   */
  private isTimeWithinRange(
    apptStart: string,
    apptEnd: string,
    whStart: string,
    whEnd: string,
  ): boolean {
    const apptStartMin = this.timeToMinutes(apptStart);
    const apptEndMin = this.timeToMinutes(apptEnd);
    const whStartMin = this.timeToMinutes(whStart);
    const whEndMin = this.timeToMinutes(whEnd);

    return apptStartMin >= whStartMin && apptEndMin <= whEndMin;
  }

  /**
   * Convert time string to minutes
   */
  private timeToMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }

  /**
   * Check if two dates are the same day
   */
  private isSameDay(date1: Date, date2: Date): boolean {
    return (
      date1.getFullYear() === date2.getFullYear() &&
      date1.getMonth() === date2.getMonth() &&
      date1.getDate() === date2.getDate()
    );
  }

  /**
   * Get unique patient count from conflicts
   */
  getUniquePatientCount(conflicts: ConflictedBooking[]): number {
    const uniquePatients = new Set(conflicts.map((c) => c.patientId));
    return uniquePatients.size;
  }
}
