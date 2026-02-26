import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';

import { DashboardResolver } from './resolvers/dashboard.resolver';
import { DashboardService } from './service/dashboard.service';
import { GqlJwtGuard } from '../common/guards/gql-jwt.guard';
import { GqlRolesGuard } from '../common/guards/gql-roles.guard';

import {
  Booking,
  BookingSchema,
} from '@app/common/database/schemas/booking.schema';
import {
  Doctor,
  DoctorSchema,
} from '@app/common/database/schemas/doctor.schema';
import { User, UserSchema } from '@app/common/database/schemas/user.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Booking.name, schema: BookingSchema },
      { name: Doctor.name, schema: DoctorSchema },
      { name: User.name, schema: UserSchema },
    ]),
    JwtModule.register({
      secret: process.env.JWT_ACCESS_SECRET,
    }),
  ],
  providers: [DashboardResolver, DashboardService, GqlJwtGuard, GqlRolesGuard],
  exports: [DashboardService],
})
export class DashboardModule {}
