import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bull';

import { NearbyController } from './users.controller';
import { UserService } from './users.service';
import { NearbyRepository } from './nearby-repository.service';
import { RoutingService } from './routing.service';
import { EntityMapper } from './entity-mapper.service';
import { NearbyCache } from './nearby-cache.service';
import { RedisService } from '@app/common/redis/redis.service';

import {
  Doctor,
  DoctorSchema,
} from '@app/common/database/schemas/doctor.schema';
import {
  Hospital,
  HospitalSchema,
} from '@app/common/database/schemas/hospital.schema';
import {
  Center,
  CenterSchema,
} from '@app/common/database/schemas/center.schema';
import {
  CommonDepartment,
  CommonDepartmentSchema,
} from '@app/common/database/schemas/common_departments.schema';
import {
  PublicSpecialization,
  PublicSpecializationSchema,
} from '@app/common/database/schemas/publicspecializations.schema';
import {
  PrivateSpecialization,
  PrivateSpecializationSchema,
} from '@app/common/database/schemas/privatespecializations.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Doctor.name, schema: DoctorSchema },
      { name: Hospital.name, schema: HospitalSchema },
      { name: Center.name, schema: CenterSchema },
      { name: CommonDepartment.name, schema: CommonDepartmentSchema },
      { name: PublicSpecialization.name, schema: PublicSpecializationSchema },
      { name: PrivateSpecialization.name, schema: PrivateSpecializationSchema },
    ]),
    BullModule.registerQueue(
      { name: 'route-processing' },
      { name: 'matrix-processing' },
    ),
  ],
  controllers: [NearbyController],
  providers: [
    // ── 1. REDIS_OPTIONS token ─────────────────────────────────────────────
    // RedisService يطلب هذا الـ token في الـ constructor عبر @Inject('REDIS_OPTIONS')
    // نوفره هنا مباشرة من متغيرات البيئة بدلاً من استيراد RedisModule
    {
      provide: 'REDIS_OPTIONS',
      useFactory: () => ({
        host: process.env.REDIS_HOST ?? 'localhost',
        port: parseInt(process.env.REDIS_PORT ?? '6379'),
        password: process.env.REDIS_PASSWORD ?? undefined,
        db: parseInt(process.env.REDIS_DB ?? '0'),
        keyPrefix: process.env.REDIS_KEY_PREFIX ?? undefined,
      }),
    },
    // ── 2. RedisService ────────────────────────────────────────────────────
    // يعتمد على REDIS_OPTIONS — يجب أن يأتي بعده
    RedisService,
    // ── 3. NearbyCache ─────────────────────────────────────────────────────
    // يعتمد على RedisService — يجب أن يأتي بعده
    NearbyCache,
    // ── 4. باقي الـ providers ──────────────────────────────────────────────
    UserService,
    NearbyRepository,
    RoutingService,
    EntityMapper,
  ],
  exports: [UserService],
})
export class UsersModule {}
