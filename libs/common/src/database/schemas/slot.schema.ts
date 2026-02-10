import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, HydratedDocument, Types } from 'mongoose';
import { BlockReason, Days, SlotStatus, WorkigEntity } from './common.enums';
export interface AppointmentSlotMethods {
  releaseHold(): void;
  book(patientId: Types.ObjectId, bookingId: Types.ObjectId): void;
  cancel(reason?: string, cancelledBy?: Types.ObjectId): void;
  block(reason: BlockReason, blockedBy: Types.ObjectId, notes?: string): void;
  unblock(): void;
  complete(actualStartTime?: Date, actualEndTime?: Date): void;
  markNoShow(markedBy: Types.ObjectId, notes?: string): void;
  incrementView(): void;
  addToWaitlist(patientId: Types.ObjectId): void;
  removeFromWaitlist(patientId: Types.ObjectId): void;
}

@Schema({ timestamps: true, collection: 'appointment_slots' })
export class AppointmentSlot extends Document {
  // ==================== CORE REFERENCES ====================

  @Prop({ type: Types.ObjectId, ref: 'Doctor', required: true, index: true })
  doctorId: Types.ObjectId;

  @Prop({
    type: String,
    enum: SlotStatus,
    default: SlotStatus.AVAILABLE,
    index: true,
  })
  status: SlotStatus;

  // ==================== DATE & TIME ====================

  @Prop({ required: true, index: true })
  date: Date; // The actual date of the appointment (e.g., 2024-03-15)

  @Prop({ required: true })
  startTime: string; // Format: "09:00"

  @Prop({ required: true })
  endTime: string; // Format: "09:30"

  @Prop({ type: String, enum: Days, required: true })
  dayOfWeek: Days;

  @Prop({ required: true })
  duration: number; // Duration in minutes

  // ==================== LOCATION ====================

  @Prop({ type: Object, required: true })
  location: {
    type: WorkigEntity;
    entity_name: string;
    address: string;
    latitude?: number;
    longitude?: number;
    floor?: string;
    room?: string;
  };

  // ==================== PRICING ====================

  @Prop()
  price?: number; // Base consultation price

  // ==================== BOOKING REFERENCE ====================

  @Prop({ type: Types.ObjectId, ref: 'Patient' })
  patientId?: Types.ObjectId; // Patient who booked this slot

  @Prop({ type: Types.ObjectId, ref: 'Booking' })
  bookingId?: Types.ObjectId; // Reference to the booking

  @Prop()
  bookedAt?: Date; // When the slot was booked

  // ==================== HOLD/RESERVATION ====================

  @Prop()
  holdExpiresAt?: Date; // When the temporary hold expires

  @Prop({ type: Types.ObjectId, ref: 'Patient' })
  heldBy?: Types.ObjectId; // Patient who has temporary hold

  @Prop()
  holdStartedAt?: Date;

  @Prop({ default: 15 })
  holdDurationMinutes: number; // How long to hold the slot

  // ==================== CANCELLATION ====================

  @Prop()
  cancelledAt?: Date;

  @Prop()
  cancellationReason?: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  cancelledBy?: Types.ObjectId; // Who cancelled (patient/doctor/admin)

  @Prop({ default: 0 })
  cancellationCount: number; // How many times this slot was cancelled

  // ==================== BLOCKING ====================

  @Prop()
  blockedAt?: Date;

  @Prop({ type: String, enum: BlockReason })
  blockReason?: BlockReason;

  @Prop()
  blockNotes?: string;

  @Prop({ type: Types.ObjectId, ref: 'Doctor' })
  blockedBy?: Types.ObjectId; // Usually the doctor themselves

  @Prop()
  blockStartTime?: string; // If blocking partial slot

  @Prop()
  blockEndTime?: string; // If blocking partial slot

  @Prop()
  completedAt?: Date;

  @Prop()
  actualStartTime?: Date; // When appointment actually started

  @Prop()
  actualEndTime?: Date; // When appointment actually ended

  @Prop()
  actualDuration?: number; // Actual duration in minutes

  // ==================== WORKING HOURS REFERENCE ====================

  @Prop()
  workingHoursRuleId?: string; // Reference to the working hours rule that generated this

  @Prop({ default: true })
  isRecurring: boolean; // Whether this slot repeats weekly

  @Prop()
  parentSlotId?: string; // For recurring slots, reference to the template

  // ==================== DOCTOR INFO (DENORMALIZED) ====================

  @Prop({ type: Object })
  doctorInfo?: {
    fullName: string;
  };

  // ==================== PATIENT INFO (DENORMALIZED) ====================

  @Prop({ type: Object })
  patientInfo?: {
    fullName?: string;
    phone?: string;
    email?: string;
  };

  // ==================== CAPACITY & OVERBOOKING ====================

  @Prop({ default: 1 })
  maxCapacity: number; // For group sessions

  @Prop({ default: 0 })
  currentBookings: number; // How many bookings for this slot

  @Prop({ default: false })
  allowOverbooking: boolean;

  @Prop({ default: 0 })
  overbookingLimit: number; // Max additional bookings allowed

  // ==================== ONLINE/TELEMEDICINE ====================

  @Prop({ default: false })
  isOnline: boolean; // Telemedicine appointment

  @Prop()
  meetingLink?: string; // Video call link

  @Prop()
  meetingId?: string; // Meeting ID

  @Prop()
  meetingPassword?: string; // Meeting password

  // ==================== WAITLIST ====================

  @Prop({ type: [{ type: Types.ObjectId, ref: 'Patient' }] })
  waitlist?: Types.ObjectId[]; // Patients waiting for this slot

  @Prop()
  waitlistCount?: number;

  @Prop({ default: false })
  notifyWaitlistOnCancellation: boolean;

  // ==================== SPECIAL CONDITIONS ====================

  @Prop({ default: false })
  requiresApproval: boolean; // Doctor must approve booking

  @Prop({ default: false })
  isFirstTimeSlot: boolean; // For new patients only

  @Prop({ default: false })
  isFollowUpSlot: boolean; // For follow-up appointments only

  @Prop({ default: false })
  isEmergencySlot: boolean; // Reserved for emergencies

  @Prop()
  minimumNoticeHours?: number; // Minimum hours before appointment to book

  @Prop()
  maximumAdvanceBookingDays?: number; // How far in advance can be booked

  // ==================== AUTOMATION & RULES ====================

  @Prop({ default: true })
  autoConfirm: boolean; // Auto-confirm booking without doctor approval

  @Prop({ default: false })
  autoRelease: boolean; // Auto-release on cancellation

  @Prop({ default: true })
  sendReminders: boolean; // Send reminders for this slot

  @Prop()
  customReminderTime?: number; // Custom reminder time in hours

  // ==================== STATISTICS & TRACKING ====================

  @Prop({ default: 0 })
  viewCount: number; // How many times slot was viewed

  @Prop({ default: 0 })
  bookingAttempts: number; // How many times people tried to book

  @Prop()
  firstViewedAt?: Date;

  @Prop()
  lastViewedAt?: Date;

  @Prop({ type: [Date] })
  viewHistory?: Date[];

  // ==================== NOTES & METADATA ====================

  @Prop()
  internalNotes?: string; // Private notes for staff/doctor

  @Prop()
  publicNotes?: string; // Notes visible to patients

  @Prop({ type: [String] })
  tags?: string[]; // For categorization (vip, urgent, follow-up, etc.)

  @Prop({ type: Object })
  metadata?: Record<string, any>; // Additional custom data

  // ==================== INTEGRATION ====================

  @Prop()
  externalId?: string; // ID from external calendar system

  @Prop()
  externalSource?: string; // Source system (google_calendar, outlook, etc.)

  @Prop()
  syncedAt?: Date;

  @Prop({ default: false })
  isSynced: boolean;

  // ==================== VERSIONING ====================

  @Prop({ default: 1 })
  version: number; // For optimistic locking

  @Prop()
  lastModifiedBy?: string; // User who last modified

  @Prop({ type: [Object] })
  changeHistory?: Array<{
    field: string;
    oldValue: any;
    newValue: any;
    changedAt: Date;
    changedBy?: string;
  }>;
}

export const AppointmentSlotSchema =
  SchemaFactory.createForClass(AppointmentSlot);

// ============================================
// COMPOUND INDEXES FOR PERFORMANCE
// ============================================

// Primary queries - finding available slots
AppointmentSlotSchema.index({ doctorId: 1, date: 1, status: 1 });
AppointmentSlotSchema.index({ status: 1, date: 1, doctorId: 1 });

// Unique constraint - prevent duplicate slots
AppointmentSlotSchema.index(
  { doctorId: 1, date: 1, startTime: 1, 'location.entity_name': 1 },
  { unique: true },
);

// Patient's bookings
AppointmentSlotSchema.index({ patientId: 1, date: 1 });
AppointmentSlotSchema.index({ bookingId: 1 });

// Date range queries
AppointmentSlotSchema.index({ date: 1, status: 1 });
AppointmentSlotSchema.index({ doctorId: 1, date: 1 });

// Available slots by location
AppointmentSlotSchema.index({ 'location.type': 1, status: 1, date: 1 });
AppointmentSlotSchema.index({ 'location.entity_name': 1, date: 1 });

// Hold management
AppointmentSlotSchema.index({ heldBy: 1, holdExpiresAt: 1 });
AppointmentSlotSchema.index({ status: 1, holdExpiresAt: 1 });

// Cleanup expired holds (TTL index)
AppointmentSlotSchema.index(
  { holdExpiresAt: 1 },
  {
    expireAfterSeconds: 0,
    partialFilterExpression: {
      holdExpiresAt: { $exists: true },
      status: SlotStatus.ON_HOLD,
    },
  },
);

// Online appointments
AppointmentSlotSchema.index({ isOnline: 1, status: 1, date: 1 });

// Special slot types
AppointmentSlotSchema.index({ isEmergencySlot: 1, status: 1 });
AppointmentSlotSchema.index({ isFirstTimeSlot: 1, status: 1 });

// TTL index to automatically expire old slots
AppointmentSlotSchema.index(
  { date: 1 },
  { expireAfterSeconds: 15552000 }, // 180 days (6 months)
);

// Text search on notes
AppointmentSlotSchema.index({ publicNotes: 'text', internalNotes: 'text' });

// ============================================
// VIRTUAL FIELDS
// ============================================

AppointmentSlotSchema.virtual('isAvailable').get(function () {
  return this.status === SlotStatus.AVAILABLE;
});

AppointmentSlotSchema.virtual('isPast').get(function () {
  const now = new Date();
  const slotDateTime = new Date(this.date);
  const [hours, minutes] = this.startTime.split(':');
  slotDateTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);
  return slotDateTime < now;
});

AppointmentSlotSchema.virtual('isToday').get(function () {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const slotDate = new Date(this.date);
  slotDate.setHours(0, 0, 0, 0);
  return today.getTime() === slotDate.getTime();
});

AppointmentSlotSchema.virtual('isTomorrow').get(function () {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  const slotDate = new Date(this.date);
  slotDate.setHours(0, 0, 0, 0);
  return tomorrow.getTime() === slotDate.getTime();
});

AppointmentSlotSchema.virtual('canBeBooked').get(function () {
  if (this.status !== SlotStatus.AVAILABLE) return false;

  const now = new Date();
  const slotDateTime = new Date(this.date);
  const [hours, minutes] = this.startTime.split(':');
  slotDateTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);

  // Check minimum notice period
  if (this.minimumNoticeHours) {
    const hoursDifference =
      (slotDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);
    if (hoursDifference < this.minimumNoticeHours) return false;
  }

  // Check maximum advance booking
  if (this.maximumAdvanceBookingDays) {
    const daysDifference =
      (slotDateTime.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    if (daysDifference > this.maximumAdvanceBookingDays) return false;
  }

  return true;
});

AppointmentSlotSchema.virtual('hasCapacity').get(function () {
  if (this.allowOverbooking) {
    return this.currentBookings < this.maxCapacity + this.overbookingLimit;
  }
  return this.currentBookings < this.maxCapacity;
});

// ============================================
// PRE-SAVE MIDDLEWARE
// ============================================

// AppointmentSlotSchema.pre('save', async function () {
//   // Track changes for history
//   if (!this.isNew && this.isModified()) {
//     const modifiedPaths = this.modifiedPaths();
//     if (!this.changeHistory) {
//       this.changeHistory = [];
//     }

//     for (const path of modifiedPaths) {
//       if (path !== 'changeHistory' && path !== 'version') {
//         this.changeHistory.push({
//           field: path,
//           oldValue: this.get(path),
//           newValue: this.get(path),
//           changedAt: new Date(),
//           changedBy: this.lastModifiedBy,
//         });
//       }
//     }

//     // Increment version for optimistic locking
//     this.version += 1;
//   }

//   // Auto-update status based on date
//   if (this.isPast && this.status === SlotStatus.AVAILABLE) {
//     this.status = SlotStatus.EXPIRED;
//   }

//   // Update booking count
//   if (this.isModified('status')) {
//     if (this.status === SlotStatus.BOOKED) {
//       this.currentBookings = (this.currentBookings || 0) + 1;
//     } else if (
//       this.status === SlotStatus.AVAILABLE ||
//       this.status === SlotStatus.CANCELLED
//     ) {
//       this.currentBookings = Math.max(0, (this.currentBookings || 0) - 1);
//     }
//   }
// });

// ============================================
// INSTANCE METHODS
// ============================================

AppointmentSlotSchema.methods.hold = function (
  this: AppointmentSlotDocument,
  patientId: Types.ObjectId,
  durationMinutes: number = 15,
): void {
  this.status = SlotStatus.ON_HOLD;
  this.heldBy = patientId;
  this.holdStartedAt = new Date();
  this.holdExpiresAt = new Date(Date.now() + durationMinutes * 60 * 1000);
  this.holdDurationMinutes = durationMinutes;
};

AppointmentSlotSchema.methods.releaseHold = function (
  this: AppointmentSlotDocument,
): void {
  this.status = SlotStatus.AVAILABLE;
  this.heldBy = undefined;
  this.holdStartedAt = undefined;
  this.holdExpiresAt = undefined;
};

AppointmentSlotSchema.methods.releaseHold = function (
  this: AppointmentSlotDocument,
): void {
  this.status = SlotStatus.AVAILABLE;
  this.heldBy = undefined;
  this.holdStartedAt = undefined;
  this.holdExpiresAt = undefined;
};

/**
 * Book the slot
 */
AppointmentSlotSchema.methods.book = function (
  this: AppointmentSlotDocument,
  patientId: Types.ObjectId,
  bookingId: Types.ObjectId,
): void {
  this.status = SlotStatus.BOOKED;
  this.patientId = patientId;
  this.bookingId = bookingId;
  this.bookedAt = new Date();

  this.heldBy = undefined;
  this.holdStartedAt = undefined;
  this.holdExpiresAt = undefined;
};

/**
 * Cancel a booking
 */
AppointmentSlotSchema.methods.cancel = function (
  this: AppointmentSlotDocument,
  reason?: string,
  cancelledBy?: Types.ObjectId,
): void {
  this.status = SlotStatus.CANCELLED;
  this.cancelledAt = new Date();
  this.cancellationReason = reason;
  this.cancelledBy = cancelledBy;
  this.cancellationCount = (this.cancellationCount ?? 0) + 1;

  // Clear active booking references
  this.patientId = undefined;
  this.bookingId = undefined;
};

/**
 * Block a slot
 */
AppointmentSlotSchema.methods.block = function (
  this: AppointmentSlotDocument,
  reason: BlockReason,
  blockedBy: Types.ObjectId,
  notes?: string,
): void {
  this.status = SlotStatus.BLOCKED;
  this.blockReason = reason;
  this.blockedBy = blockedBy;
  this.blockedAt = new Date();
  this.blockNotes = notes;
};

/**
 * Unblock a slot
 */
AppointmentSlotSchema.methods.unblock = function (
  this: AppointmentSlotDocument,
): void {
  this.status = SlotStatus.AVAILABLE;
  this.blockReason = undefined;
  this.blockedBy = undefined;
  this.blockedAt = undefined;
  this.blockNotes = undefined;
};

/**
 * Mark appointment as completed
 */
AppointmentSlotSchema.methods.complete = function (
  this: AppointmentSlotDocument,
  actualStartTime?: Date,
  actualEndTime?: Date,
): void {
  this.status = SlotStatus.COMPLETED;
  this.completedAt = new Date();

  this.actualStartTime = actualStartTime ?? new Date();
  this.actualEndTime = actualEndTime ?? new Date();

  if (this.actualStartTime && this.actualEndTime) {
    this.actualDuration =
      (this.actualEndTime.getTime() - this.actualStartTime.getTime()) /
      (1000 * 60);
  }
};

/**
 * Mark patient as no-show
 */
// AppointmentSlotSchema.methods.markNoShow = function (
//   this: AppointmentSlotDocument,
//   markedBy: Types.ObjectId,
//   notes?: string,
// ): void {
//   this.status = SlotStatus.NO_SHOW;
//   this.noShowMarkedAt = new Date();
//   this.noShowMarkedBy = markedBy;
//   this.noShowNotes = notes;
// };

/**
 * Increment slot view counters
 */
AppointmentSlotSchema.methods.incrementView = function (
  this: AppointmentSlotDocument,
): void {
  this.viewCount = (this.viewCount ?? 0) + 1;
  this.lastViewedAt = new Date();

  if (!this.firstViewedAt) {
    this.firstViewedAt = new Date();
  }

  if (!this.viewHistory) {
    this.viewHistory = [];
  }

  this.viewHistory.push(new Date());
};

/**
 * Add patient to waitlist
 */
AppointmentSlotSchema.methods.addToWaitlist = function (
  this: AppointmentSlotDocument,
  patientId: Types.ObjectId,
): void {
  if (!this.waitlist) {
    this.waitlist = [];
  }

  const exists = this.waitlist.some((id) => id.equals(patientId));
  if (!exists) {
    this.waitlist.push(patientId);
    this.waitlistCount = this.waitlist.length;
  }
};

/**
 * Remove patient from waitlist
 */
AppointmentSlotSchema.methods.removeFromWaitlist = function (
  this: AppointmentSlotDocument,
  patientId: Types.ObjectId,
): void {
  if (!this.waitlist) return;

  this.waitlist = this.waitlist.filter((id) => !id.equals(patientId));

  this.waitlistCount = this.waitlist.length;
};

export type AppointmentSlotDocument = HydratedDocument<AppointmentSlot> &
  AppointmentSlotMethods;
