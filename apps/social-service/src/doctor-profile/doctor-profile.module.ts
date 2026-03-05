import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  Doctor,
  DoctorSchema,
} from '@app/common/database/schemas/doctor.schema';
import { DoctorProfileController } from './profile.controller';
import { DoctorProfileService } from './profile.service';
import { DoctorRepository } from './profile.repository';
import { EntityProfileModule } from './entity-profile/entity-profile.module';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        ttl: 60,
        limit: 5,
      },
    ]),
    MongooseModule.forFeature([{ name: Doctor.name, schema: DoctorSchema }]),
    EntityProfileModule,
  ],
  controllers: [DoctorProfileController],
  providers: [
    DoctorProfileService,
    DoctorRepository,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class DoctorProfileModule {}
