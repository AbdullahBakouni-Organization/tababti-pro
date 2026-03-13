import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { DashboardController } from './controller/dashboard.controller';
import { DashboardService } from './service/dashboard.service.rest';

import { BookingSchema } from '@app/common/database/schemas/booking.schema';
import { DoctorSchema } from '@app/common/database/schemas/doctor.schema';
import { UserSchema } from '@app/common/database/schemas/user.schema';

import { AuthValidateModule } from '@app/common/auth-validate';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'Booking', schema: BookingSchema },
      { name: 'Doctor', schema: DoctorSchema },
      { name: 'User', schema: UserSchema },
    ]),
    AuthValidateModule,
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
  exports: [DashboardService],
})
export class DashboardModule {}
