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

import { TransliterationCacheSchema } from './schemas/transliteration-cache.schema';
import { AdminSchema } from './schemas/admin.schema';
import { OffersSchema } from './schemas/offers.schema';
import { RatingSchema } from './schemas/rating.schema';
import { PostSchema } from './schemas/post.schema';
import { MedicalEquipmentRequestSchema } from './schemas/medical_equipment_requests.schema';
import { LegalAdviceRequestSchema } from './schemas/legal_advice_requests.schema';
import { SubscriptionSchema } from './schemas/subscribtion.schema';
import { SubCitiesSchema } from './schemas/sub-cities.schema';
import { AdsSchema } from './schemas/ads.schema';
import { SystemConfigSchema } from './schemas/system-config.schema';
import { CitySchema } from './schemas/cities.schema';
import { AppointmentSlotSchema } from './schemas/slot.schema';

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
      { name: 'Offer', schema: OffersSchema },
      { name: 'Post', schema: PostSchema },
      { name: 'Booking', schema: BookingSchema },
      { name: 'Rating', schema: RatingSchema },
      {
        name: 'MedicalEquipmentRequest',
        schema: MedicalEquipmentRequestSchema,
      },
      {
        name: 'LegalAdviceRequest',
        schema: LegalAdviceRequestSchema,
      },
      {
        name: 'TransliterationCache',
        schema: TransliterationCacheSchema,
      },
      {
        name: 'Admin',
        schema: AdminSchema,
      },
      {
        name: 'Subscription',
        schema: SubscriptionSchema,
      },
      {
        name: 'SubCities',
        schema: SubCitiesSchema,
      },
      {
        name: 'Cities',
        schema: CitySchema,
      },
      {
        name: 'Ads',
        schema: AdsSchema,
      },
      {
        name: 'SystemConfig',
        schema: SystemConfigSchema,
      },
      {
        name: 'AppointmentSlot',
        schema: AppointmentSlotSchema,
      },
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
