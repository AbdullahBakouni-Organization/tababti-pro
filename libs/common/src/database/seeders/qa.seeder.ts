import * as dotenv from 'dotenv';
dotenv.config();

import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { DatabaseModule } from '../database.module';
import { AuthAccount } from '../schemas/auth.schema';
import { User } from '../schemas/user.schema';
import { Doctor } from '../schemas/doctor.schema';
import { Question } from '../schemas/question.schema';
import { Answer } from '../schemas/answer.schema';
import {
  UserRole,
  Gender,
  City,
  ApprovalStatus,
  QuestionStatus,
  AnswerStatus,
  Days,
  WorkigEntity,
} from '../schemas/common.enums';

// ═══════════════════════════════════════════════════════════════════════════
// FIXED REFERENCE IDS (already seeded in the DB — we only reference them)
// ═══════════════════════════════════════════════════════════════════════════

const UNKNOWN_QUESTION_ID = new Types.ObjectId('69d5103b937e68854aea8612');

// Subset of the provided privateSpecialization IDs. The full list lives in
// the DB; we only need a handful to anchor the seeded questions.
const SPECIALIZATION_IDS = {
  pediatrics: new Types.ObjectId('69d5102a4fe9d9ceec89e37c'),
  dermatology: new Types.ObjectId('69d5102a4fe9d9ceec89e381'),
  cardiology: new Types.ObjectId('69d5102a4fe9d9ceec89e37e'),
  ophthalmology: new Types.ObjectId('69d5102a4fe9d9ceec89e382'),
  ent: new Types.ObjectId('69d5102a4fe9d9ceec89e383'),
  generalDentistry: new Types.ObjectId('69d5102a4fe9d9ceec89e3a6'),
  orthopedics: new Types.ObjectId('69d5102a4fe9d9ceec89e37f'),
};

// Each doctor is paired with one of the IDs above so Answer.responderId
// maps to a plausible specialist for the question's specialization.
const DOCTOR_SPEC_ASSIGNMENT: (keyof typeof SPECIALIZATION_IDS)[] = [
  'pediatrics',
  'dermatology',
  'cardiology',
  'ophthalmology',
  'ent',
];

// User & Doctor name regex (`/^[\p{L}._-]+$/u`) rejects digits, so we use
// digit-free ordinal words to suffix our seeded names.
const ORDINAL_EN = ['one', 'two', 'three', 'four', 'five'];
const ORDINAL_AR = ['الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس'];

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function syrianPhone(suffix: number): string {
  // +9639 + 8 digits. `suffix` must be < 1e8.
  return `+9639${String(suffix).padStart(8, '0')}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN SEEDER
// ═══════════════════════════════════════════════════════════════════════════

class QaSeeder {
  async seed(): Promise<void> {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'QaSeeder refuses to run with NODE_ENV=production. ' +
          'Set NODE_ENV=development (or unset it) before seeding.',
      );
    }

    const seedDoctorPassword = process.env.SEED_DOCTOR_PASSWORD;
    if (!seedDoctorPassword || seedDoctorPassword.length < 8) {
      throw new Error(
        'SEED_DOCTOR_PASSWORD env var is required (min 8 chars) to run QaSeeder.',
      );
    }

    console.log('🌱 Starting Q&A seed...\n');
    const app = await NestFactory.createApplicationContext(DatabaseModule);

    const authModel = app.get<Model<AuthAccount>>(
      getModelToken(AuthAccount.name),
    );
    const userModel = app.get<Model<User>>(getModelToken(User.name));
    const doctorModel = app.get<Model<Doctor>>(getModelToken(Doctor.name));
    const questionModel = app.get<Model<Question>>(
      getModelToken(Question.name),
    );
    const answerModel = app.get<Model<Answer>>(getModelToken(Answer.name));

    try {
      // ─────────────────────────────────────────────────────────────────
      // 0. CLEAR — wipe Q&A fixtures + their owning auth/users/doctors.
      //    Necessary so a previously-failed run (which may have left
      //    orphan AuthAccount docs behind) does not leak forward into
      //    this run. The NODE_ENV guard above prevents this firing in
      //    production.
      // ─────────────────────────────────────────────────────────────────
      console.log('0️⃣  Clearing previous Q&A seed data...');

      const [
        deletedAnswers,
        deletedQuestions,
        deletedDoctors,
        deletedUsers,
        deletedAuth,
      ] = await Promise.all([
        answerModel.deleteMany({}),
        questionModel.deleteMany({}),
        doctorModel.deleteMany({}),
        userModel.deleteMany({}),
        authModel.deleteMany({}),
      ]);

      console.log(
        `   🗑️  Cleared answers=${deletedAnswers.deletedCount} ` +
          `questions=${deletedQuestions.deletedCount} ` +
          `doctors=${deletedDoctors.deletedCount} ` +
          `users=${deletedUsers.deletedCount} ` +
          `auth=${deletedAuth.deletedCount}\n`,
      );

      // ─────────────────────────────────────────────────────────────────
      // 1. AUTH ACCOUNTS — users + doctors
      //    Each actor gets its own AuthAccount first; the user/doctor
      //    document references it via `authAccountId`.
      // ─────────────────────────────────────────────────────────────────
      console.log('1️⃣  Creating AuthAccounts...');

      const userAuthDocs = await authModel.insertMany(
        Array.from({ length: 5 }, (_, i) => ({
          phones: [syrianPhone(10_000_000 + i)],
          role: UserRole.USER,
          isActive: true,
          tokenVersion: 0,
        })),
      );

      const doctorAuthDocs = await authModel.insertMany(
        Array.from({ length: 5 }, (_, i) => ({
          phones: [syrianPhone(20_000_000 + i)],
          role: UserRole.DOCTOR,
          isActive: true,
          tokenVersion: 0,
        })),
      );

      console.log(
        `   ✅ ${userAuthDocs.length} user auth + ${doctorAuthDocs.length} doctor auth accounts\n`,
      );

      // ─────────────────────────────────────────────────────────────────
      // 2. USERS
      //    Linked to their AuthAccount via authAccountId.
      // ─────────────────────────────────────────────────────────────────
      console.log('2️⃣  Creating Users...');

      const userDocs = await userModel.insertMany(
        userAuthDocs.map((auth, i) => ({
          authAccountId: auth._id,
          username: `patient_user_${ORDINAL_EN[i]}`,
          phone: auth.phones[0],
          gender: i % 2 === 0 ? Gender.MALE : Gender.FEMALE,
          city: City.Damascus,
          DataofBirth: new Date(1990, i % 12, (i % 27) + 1),
          status: ApprovalStatus.ACTIVE,
        })),
      );

      console.log(`   ✅ ${userDocs.length} users\n`);

      // ─────────────────────────────────────────────────────────────────
      // 3. DOCTORS
      //    Linked to AuthAccount via authAccountId. Password is stored as
      //    plaintext here; DoctorSchema.pre('save') re-hashes with scrypt
      //    — but insertMany bypasses `save` middleware, so we create each
      //    doctor with `.create()` to keep the hashing invariant.
      // ─────────────────────────────────────────────────────────────────
      console.log('3️⃣  Creating Doctors...');

      const doctorDocs: Doctor[] = [];
      for (let i = 0; i < doctorAuthDocs.length; i++) {
        const auth = doctorAuthDocs[i];
        const specKey = DOCTOR_SPEC_ASSIGNMENT[i];
        const specId = SPECIALIZATION_IDS[specKey];

        const doctor = await doctorModel.create({
          authAccountId: auth._id,
          firstName: `طبيب_${ORDINAL_AR[i]}`,
          middleName: `وسيط_${ORDINAL_AR[i]}`,
          lastName: `اللقب_${ORDINAL_AR[i]}`,
          password: seedDoctorPassword,
          privateSpecializationId: specId,
          privateSpecialization: specKey,
          publicSpecialization: 'طب_بشري',
          city: City.Damascus,
          subcity: 'أبو رمانة',
          phones: [{ normal: [auth.phones[0]], clinic: [], whatsup: [] }],
          workingHours: [
            {
              day: Days.MONDAY,
              location: {
                type: WorkigEntity.CLINIC,
                entity_name: 'Main Clinic',
                address: 'Damascus',
              },
              startTime: '09:00',
              endTime: '17:00',
            },
          ],
          gender: i % 2 === 0 ? Gender.MALE : Gender.FEMALE,
          rating: 4,
          status: ApprovalStatus.APPROVED,
          inspectionDuration: 30,
          inspectionPrice: 50,
          isSubscribed: false,
          maxSessions: 5,
          searchCount: 0,
          profileViews: 0,
          yearsOfExperience: 5 + i,
        });

        doctorDocs.push(doctor);
      }

      console.log(`   ✅ ${doctorDocs.length} doctors\n`);

      // ─────────────────────────────────────────────────────────────────
      // 4. QUESTIONS
      //    userId references User._id (matches questions.service.ts, which
      //    resolves the caller's AuthAccount -> User and stores User._id).
      //    Mix: some target a real specialization, some target the
      //    unknown-question document via `unknownId`.
      // ─────────────────────────────────────────────────────────────────
      console.log('4️⃣  Creating Questions...');

      const specKeys = Object.keys(
        SPECIALIZATION_IDS,
      ) as (keyof typeof SPECIALIZATION_IDS)[];

      const questionPayloads = [
        // Known-specialization questions
        ...specKeys.slice(0, 5).map((key, i) => ({
          userId: userDocs[i % userDocs.length]._id as Types.ObjectId,
          content: `سؤال طبي في اختصاص ${key} رقم ${i + 1}`,
          specializationId: SPECIALIZATION_IDS[key],
          status: QuestionStatus.APPROVED,
          approvalStatus: ApprovalStatus.APPROVED,
          hasText: true,
          hasImages: false,
        })),
        // Unknown-specialization questions — the user couldn't pick a field
        ...Array.from({ length: 5 }, (_, i) => ({
          userId: userDocs[i % userDocs.length]._id as Types.ObjectId,
          content: `سؤال عام بدون اختصاص محدد رقم ${i + 1}`,
          unknownId: UNKNOWN_QUESTION_ID.toHexString(),
          status: QuestionStatus.PENDING,
          approvalStatus: ApprovalStatus.PENDING,
          hasText: true,
          hasImages: false,
        })),
      ];

      const questionDocs = await questionModel.insertMany(questionPayloads);
      console.log(`   ✅ ${questionDocs.length} questions\n`);

      // ─────────────────────────────────────────────────────────────────
      // 5. ANSWERS
      //    responderType is always "doctor".
      //    responderId references AuthAccount._id of the answering doctor
      //    (NOT Doctor._id) per task spec.
      //    Every question gets ≥ 1 answer.
      // ─────────────────────────────────────────────────────────────────
      console.log('5️⃣  Creating Answers...');

      const answerPayloads: Partial<Answer>[] = [];
      for (let i = 0; i < questionDocs.length; i++) {
        const q = questionDocs[i];
        const doctorAuthId = doctorAuthDocs[i % doctorAuthDocs.length]._id;

        answerPayloads.push({
          questionId: q._id as Types.ObjectId,
          responderType: UserRole.DOCTOR,
          responderId: doctorAuthId as Types.ObjectId,
          content: `رد الطبيب على السؤال رقم ${i + 1}`,
          status: AnswerStatus.PENDING,
        });

        // Half of the questions receive a second answer from another doctor
        if (i % 2 === 0) {
          const secondDoctorAuthId =
            doctorAuthDocs[(i + 1) % doctorAuthDocs.length]._id;
          answerPayloads.push({
            questionId: q._id as Types.ObjectId,
            responderType: UserRole.DOCTOR,
            responderId: secondDoctorAuthId as Types.ObjectId,
            content: `رأي طبي ثانٍ على السؤال رقم ${i + 1}`,
            status: AnswerStatus.PENDING,
          });
        }
      }

      const answerDocs = await answerModel.insertMany(answerPayloads);
      console.log(`   ✅ ${answerDocs.length} answers\n`);

      console.log('🎉 Q&A seed complete.');
    } finally {
      await app.close();
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Bootstrap
// ─────────────────────────────────────────────────────────────────────────────

async function bootstrap(): Promise<void> {
  const seeder = new QaSeeder();
  await seeder.seed();
}

bootstrap()
  .then(() => {
    console.log('✅ QaSeeder finished');
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ QaSeeder crashed:', err);
    process.exit(1);
  });
