// libs/common/kafka/events/booking.events.ts
export interface BookingCreatedEvent {
  bookingId: string;
  userId: string;
  doctorId: string;
  appointmentDate: Date;
  appointmentTime: string;
  timestamp: Date;
}

export interface BookingCancelledEvent {
  bookingId: string;
  userId: string;
  doctorId: string;
  cancelledBy: 'user' | 'doctor' | 'system';
  reason: string;
  timestamp: Date;
}

export interface DoctorWorkingHoursUpdatedEvent {
  doctorId: string;
  workingHours: any[];
  affectedDates: Date[];
  timestamp: Date;
}

export interface DoctorHolidayAddedEvent {
  doctorId: string;
  holidayDate: Date;
  reason: string;
  affectedBookings: string[];
  timestamp: Date;
}

export interface CacheInvalidateEvent {
  pattern: string; // e.g., "doctor:123:*", "search:*"
  keys?: string[];
  timestamp: Date;
}
