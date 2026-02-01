import 'dotenv/config';
import { Module, Global, Logger, OnModuleInit } from '@nestjs/common';
import { MongooseModule, InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { UserSchema } from './schemas/user.schema';
import { AuthAccountSchema } from './schemas/auth.schema';
import { OtpSchema } from './schemas/otp.schema';
import { DoctorSchema } from './schemas/doctor.schema';
import { HospitalSchema } from './schemas/hospital.schema';
import { CenterSchema } from './schemas/center.schema';
import { QuestionSchema } from './schemas/question.schema';
import { AnswerSchema } from './schemas/answer.schema';
import { ReviewSchema } from './schemas/review.schema';
import { PublicSpecializationSchema } from './schemas/publicspecializations.schema';
import { PrivateSpecializationSchema } from './schemas/privatespecializations.schema';
import { NotificationSchema } from './schemas/notification.schema';
import { BookingSchema } from './schemas/booking.schema';
import { ContentSchema } from './schemas/content.schema';
import { InsuranceCompanySchema } from './schemas/insurancecompany.schema';
import { TransliterationCacheSchema } from './schemas/transliteration-cache.schema';
import { AdminSchema } from './schemas/admin.schema';

@Global()
@Module({
  imports: [
    MongooseModule.forRootAsync({
      useFactory: () => ({
        uri: process.env.MONGO_URI,
        dbName: process.env.MONGO_DB,
        authSource: 'admin',
      }),
    }),
    MongooseModule.forFeature([
      { name: 'User', schema: UserSchema },
      { name: 'AuthAccount', schema: AuthAccountSchema },
      { name: 'Otp', schema: OtpSchema },
      { name: 'Doctor', schema: DoctorSchema },
      { name: 'Hospital', schema: HospitalSchema },
      { name: 'Center', schema: CenterSchema },
      { name: 'Question', schema: QuestionSchema },
      { name: 'Answer', schema: AnswerSchema },
      { name: 'Review', schema: ReviewSchema },
      { name: 'PublicSpecialization', schema: PublicSpecializationSchema },
      { name: 'PrivateSpecialization', schema: PrivateSpecializationSchema },
      { name: 'Notification', schema: NotificationSchema },
      { name: 'Booking', schema: BookingSchema },
      { name: 'Content', schema: ContentSchema },
      { name: 'InsuranceCompany', schema: InsuranceCompanySchema },
      { name: 'TransliterationCache', schema: TransliterationCacheSchema },
      { name: 'Admin', schema: AdminSchema },
    ]),
  ],
  exports: [MongooseModule],
})
export class DatabaseModule implements OnModuleInit {
  private readonly logger = new Logger('MongoConnection');

  constructor(@InjectConnection() private readonly connection: Connection) {}

  onModuleInit() {
    // 1. Check current state immediately
    if (this.connection.readyState === 1) {
      this.logSuccess();
    }

    // 2. Listen for state changes
    this.connection.on('connected', () => this.logSuccess());

    this.connection.on('error', (err) => {
      const error = err as Error;
      this.logger.error(`MongoDB connection error: ${error.message}`);
    });

    this.connection.on('disconnected', () => {
      this.logger.warn('MongoDB disconnected');
    });
  }

  private logSuccess() {
    const { name } = this.connection;
    this.logger.log(`✅ MongoDB Connected: in ${name}`);
  }
}
