import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BookingStatus } from '@app/common/database/schemas/common.enums';
import { ConflictedBooking } from './dto/update-working-hours.dto';
import {
  Booking,
  BookingDocument,
} from '@app/common/database/schemas/booking.schema';
import { getSyriaDate } from '@app/common/utils/get-syria-date';
import { timeToMinutes } from '@app/common/utils/time-ago.util';

@Injectable()
export class ConflictDetectionService {
  private readonly logger = new Logger(ConflictDetectionService.name);

  constructor(
    @InjectModel(Booking.name)
    private appointmentModel: Model<BookingDocument>,
  ) {}

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
    const today = getSyriaDate();
    const endDate = new Date(today);
    endDate.setDate(today.getDate() + 365);

    // ✅ Only care about days that are in the new working hours
    const updatedDays = [
      ...new Set(newWorkingHours.map((wh) => wh.day.toLowerCase())),
    ];

    const bookings = await this.appointmentModel
      .find({
        doctorId: new Types.ObjectId(doctorId),
        status: { $in: [BookingStatus.PENDING] },
        bookingDate: { $gte: today, $lte: endDate },
        // Include both regular patient bookings (patientId set) and manual-patient
        // bookings created by the doctor (patientId null but patientPhone present).
        $or: [{ patientId: { $ne: null } }, { patientPhone: { $ne: null } }],
      })
      .populate('patientId', 'username phone')
      .populate('slotId')
      .lean()
      .exec();

    const todayConflicts: ConflictedBooking[] = [];
    const futureConflicts: ConflictedBooking[] = [];

    for (const booking of bookings) {
      const slot =
        typeof booking.slotId === 'object' && 'startTime' in booking.slotId
          ? booking.slotId
          : null;

      if (!slot) continue;

      // ✅ Skip bookings for days NOT being updated
      if (!updatedDays.includes(slot.dayOfWeek.toLowerCase())) continue;

      const conflict = this.checkBookingConflict(booking, newWorkingHours);
      if (!conflict) continue;

      // Resolve patient details — supports both regular DB patients and manual patients.
      const populatedPatient =
        booking.patientId !== null &&
        typeof booking.patientId === 'object' &&
        'username' in booking.patientId
          ? (booking.patientId as unknown as {
              _id: Types.ObjectId;
              username: string;
              phone: string;
            })
          : null;

      const isManualPatient =
        populatedPatient === null && booking.patientPhone != null;

      // Skip only if neither a real patient nor a manual patient can be resolved.
      if (!populatedPatient && !isManualPatient) continue;

      // Use the phone as a surrogate identifier for manual patients so that
      // getUniquePatientCount() counts distinct phones rather than collapsing all
      // manual patients into the same empty-string bucket.
      const resolvedPatientId = populatedPatient
        ? populatedPatient._id.toString()
        : (booking.patientPhone as string);

      const resolvedPatientName = populatedPatient
        ? populatedPatient.username
        : (booking.patientName ?? 'Manual Patient');

      const resolvedPatientContact = populatedPatient
        ? populatedPatient.phone
        : (booking.patientPhone as string);

      const isToday = this.isSameDay(booking.bookingDate, today);

      const conflictedBooking: ConflictedBooking = {
        bookingId: booking._id.toString(),
        patientId: resolvedPatientId,
        patientName: resolvedPatientName,
        patientContact: resolvedPatientContact,
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
    const apptStartMin = timeToMinutes(apptStart);
    const apptEndMin = timeToMinutes(apptEnd);
    const whStartMin = timeToMinutes(whStart);
    const whEndMin = timeToMinutes(whEnd);

    return apptStartMin >= whStartMin && apptEndMin <= whEndMin;
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
