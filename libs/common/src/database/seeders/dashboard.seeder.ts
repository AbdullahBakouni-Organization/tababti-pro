/**
 * Dashboard Seeder
 * Seeds Users and Bookings to fully populate all dashboard sections for Jaafar Bakouni
 *
 * Run with:
 *   npx ts-node src/database/seeders/dashboard.seeder.ts
 *
 * Or add to your NestJS bootstrap as a one-time seeder.
 */

import 'dotenv/config';
import mongoose, { Types } from 'mongoose';
import {
  BookingStatus,
  Gender,
  UserRole,
  WorkigEntity,
  ApprovalStatus,
  City,
} from '../schemas/common.enums';

// ─── Config ───────────────────────────────────────────────────────────────────

const MONGO_URI = process.env.MONGO_URI!;
const MONGO_DB = process.env.MONGO_DB!;

// ✅ Jaafar's IDs — taken directly from your DB
const DOCTOR_ID = new Types.ObjectId('69a18db329a966d693d9f417');
const AUTH_ACCOUNT_ID = new Types.ObjectId('69a18db329a966d693d9f419');

// ─── Schemas (inline — no NestJS DI needed) ───────────────────────────────────

const UserSchema = new mongoose.Schema(
  {
    authAccountId: { type: Types.ObjectId, ref: 'AuthAccount' },
    username: { type: String, required: true },
    phone: { type: String, required: true, unique: true },
    gender: { type: String, enum: Object.values(Gender), required: true },
    image: { type: String },
    city: { type: String, required: true },
    DataofBirth: { type: Date, required: true },
    status: { type: String, required: true },
    fcmToken: { type: String },
  },
  { timestamps: true, collection: 'users' },
);

const BookingSchema = new mongoose.Schema(
  {
    patientId: { type: Types.ObjectId, ref: 'User', required: true },
    doctorId: { type: Types.ObjectId, ref: 'Doctor', required: true },
    slotId: { type: Types.ObjectId, ref: 'AppointmentSlot', required: true },
    status: {
      type: String,
      enum: Object.values(BookingStatus),
      default: BookingStatus.PENDING,
    },
    workingHoursVersion: { type: Number },
    bookingDate: { type: Date, required: true },
    bookingTime: { type: String, required: true },
    bookingEndTime: { type: String, required: true },
    location: { type: Object, required: true },
    cancellation: { type: Object },
    price: { type: Number, required: true },
    createdBy: { type: String, required: true },
    isRated: { type: Boolean, default: false },
    ratingId: { type: Types.ObjectId },
    note: { type: String },
    completedAt: { type: Date },
  },
  { timestamps: true, collection: 'bookings' },
);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function dateInCurrentMonth(day: number, hour = 10): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), day, hour, 0, 0);
}

function dateInLastMonth(day: number, hour = 10): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() - 1, day, hour, 0, 0);
}

function makePhone(suffix: string) {
  return `+9639381${suffix}`;
}

const LOCATIONS = [
  {
    type: WorkigEntity.CLINIC,
    entity_name: 'Al Shifa Clinic',
    address: 'Damascus, Mezzeh',
  },
  {
    type: WorkigEntity.CLINIC,
    entity_name: 'Ibn Sina Medical',
    address: 'Damascus, Kafar Souseh',
  },
  {
    type: WorkigEntity.HOSPITAL,
    entity_name: 'Al Assad Hospital',
    address: 'Damascus, Mazraa',
  },
];

// ─── Main Seeder ──────────────────────────────────────────────────────────────

async function seed() {
  await mongoose.connect(MONGO_URI, { dbName: MONGO_DB });
  console.log('✅ Connected to MongoDB');

  const UserModel = mongoose.model('User', UserSchema);
  const BookingModel = mongoose.model('Booking', BookingSchema);

  // ── 1. Create 5 test patients ─────────────────────────────────────────────

  const patientData = [
    {
      username: 'Ahmad Khalil',
      phone: makePhone('44001'),
      gender: Gender.MALE,
    },
    {
      username: 'Sara Hassan',
      phone: makePhone('44002'),
      gender: Gender.FEMALE,
    },
    { username: 'Mohamed Ali', phone: makePhone('44003'), gender: Gender.MALE },
    {
      username: 'Lina Youssef',
      phone: makePhone('44004'),
      gender: Gender.FEMALE,
    },
    {
      username: 'Khaled Nasser',
      phone: makePhone('44005'),
      gender: Gender.MALE,
    },
  ];

  const patients: any[] = [];

  for (const p of patientData) {
    // upsert by phone so seeder is safe to re-run
    const patient = await UserModel.findOneAndUpdate(
      { phone: p.phone },
      {
        $setOnInsert: {
          authAccountId: new Types.ObjectId(),
          username: p.username,
          phone: p.phone,
          gender: p.gender,
          city: City.Damascus ?? 'دمشق',
          DataofBirth: new Date('1990-01-01'),
          status: ApprovalStatus.APPROVED ?? 'approved',
        },
      },
      { upsert: true, new: true },
    );
    patients.push(patient);
    console.log(`👤 Patient upserted: ${p.username} (${patient._id})`);
  }

  // ── 2. Delete existing seeded bookings for this doctor ────────────────────
  await BookingModel.deleteMany({ doctorId: DOCTOR_ID, note: 'seeded' });
  console.log('🗑️  Cleared old seeded bookings');

  // ── 3. Build bookings ─────────────────────────────────────────────────────

  const bookings: any[] = [];

  // ── Current month: 8 completed, 3 pending, 2 confirmed ──────────────────
  const currentMonthBookings = [
    // COMPLETED — these count toward revenue and stats
    {
      day: 1,
      patientIdx: 0,
      status: BookingStatus.COMPLETED,
      price: 2500,
      time: '09:00',
      endTime: '09:30',
      locIdx: 0,
    },
    {
      day: 3,
      patientIdx: 1,
      status: BookingStatus.COMPLETED,
      price: 2500,
      time: '10:00',
      endTime: '10:30',
      locIdx: 0,
    },
    {
      day: 5,
      patientIdx: 2,
      status: BookingStatus.COMPLETED,
      price: 3000,
      time: '11:00',
      endTime: '11:30',
      locIdx: 1,
    },
    {
      day: 8,
      patientIdx: 3,
      status: BookingStatus.COMPLETED,
      price: 3000,
      time: '14:00',
      endTime: '14:30',
      locIdx: 1,
    },
    {
      day: 10,
      patientIdx: 4,
      status: BookingStatus.COMPLETED,
      price: 2000,
      time: '09:00',
      endTime: '09:30',
      locIdx: 2,
    },
    {
      day: 12,
      patientIdx: 0,
      status: BookingStatus.COMPLETED,
      price: 2500,
      time: '10:00',
      endTime: '10:30',
      locIdx: 0,
    },
    {
      day: 15,
      patientIdx: 1,
      status: BookingStatus.COMPLETED,
      price: 2500,
      time: '11:00',
      endTime: '11:30',
      locIdx: 0,
    },
    {
      day: 18,
      patientIdx: 2,
      status: BookingStatus.COMPLETED,
      price: 3000,
      time: '14:00',
      endTime: '14:30',
      locIdx: 1,
    },
    // PENDING
    {
      day: 20,
      patientIdx: 3,
      status: BookingStatus.PENDING,
      price: 3000,
      time: '09:00',
      endTime: '09:30',
      locIdx: 2,
    },
    {
      day: 22,
      patientIdx: 4,
      status: BookingStatus.PENDING,
      price: 2500,
      time: '10:00',
      endTime: '10:30',
      locIdx: 0,
    },
    {
      day: 25,
      patientIdx: 0,
      status: BookingStatus.PENDING,
      price: 2500,
      time: '11:00',
      endTime: '11:30',
      locIdx: 1,
    },
    // CONFIRMED
    {
      day: 27,
      patientIdx: 1,
      status: BookingStatus.CONFIRMED,
      price: 3000,
      time: '14:00',
      endTime: '14:30',
      locIdx: 2,
    },
    {
      day: 28,
      patientIdx: 2,
      status: BookingStatus.CONFIRMED,
      price: 2000,
      time: '15:00',
      endTime: '15:30',
      locIdx: 0,
    },
  ];

  for (const b of currentMonthBookings) {
    bookings.push({
      patientId: patients[b.patientIdx]._id,
      doctorId: DOCTOR_ID,
      slotId: new Types.ObjectId(), // fake slot ref
      status: b.status,
      workingHoursVersion: 1,
      bookingDate: dateInCurrentMonth(b.day),
      bookingTime: b.time,
      bookingEndTime: b.endTime,
      location: LOCATIONS[b.locIdx],
      price: b.price,
      createdBy: UserRole.USER,
      isRated: false,
      note: 'seeded',
      completedAt:
        b.status === BookingStatus.COMPLETED
          ? dateInCurrentMonth(b.day, 11)
          : undefined,
    });
  }

  // ── Last month: 5 completed — used for revenueChangePercent comparison ────
  const lastMonthBookings = [
    { day: 5, patientIdx: 0, price: 2500 },
    { day: 10, patientIdx: 1, price: 2500 },
    { day: 15, patientIdx: 2, price: 3000 },
    { day: 20, patientIdx: 3, price: 2000 },
    { day: 25, patientIdx: 4, price: 2500 },
  ];

  for (const b of lastMonthBookings) {
    bookings.push({
      patientId: patients[b.patientIdx]._id,
      doctorId: DOCTOR_ID,
      slotId: new Types.ObjectId(),
      status: BookingStatus.COMPLETED,
      workingHoursVersion: 1,
      bookingDate: dateInLastMonth(b.day),
      bookingTime: '10:00',
      bookingEndTime: '10:30',
      location: LOCATIONS[0],
      price: b.price,
      createdBy: UserRole.USER,
      isRated: false,
      note: 'seeded',
      completedAt: dateInLastMonth(b.day, 11),
    });
  }

  await BookingModel.insertMany(bookings);
  console.log(`✅ Inserted ${bookings.length} bookings`);

  // ── 4. Summary ────────────────────────────────────────────────────────────

  const currentCompleted = currentMonthBookings.filter(
    (b) => b.status === BookingStatus.COMPLETED,
  );
  const currentRevenue = currentCompleted.reduce((sum, b) => sum + b.price, 0);
  const lastRevenue = lastMonthBookings.reduce((sum, b) => sum + b.price, 0);
  const revenueChange = Math.round(
    ((currentRevenue - lastRevenue) / lastRevenue) * 100,
  );

  console.log('\n📊 Expected Dashboard Values:');
  console.log('─────────────────────────────────────────');
  console.log(`totalAppointments:      ${currentMonthBookings.length}`);
  console.log(`completedAppointments:  ${currentCompleted.length}`);
  console.log(
    `incompleteAppointments: ${currentMonthBookings.length - currentCompleted.length}`,
  );
  console.log(`estimatedRevenue:       ${currentRevenue} SYP`);
  console.log(`lastMonthRevenue:       ${lastRevenue} SYP`);
  console.log(`revenueChangePercent:   ${revenueChange}%`);
  console.log('─────────────────────────────────────────');
  console.log(
    '\n✅ Seeding complete! Now query doctorDashboard without selectedDate',
  );
  console.log("   or use today's date to see current month data.\n");

  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error('❌ Seeder failed:', err);
  process.exit(1);
});
