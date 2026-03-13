// entity-profile.module.ts
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { EntityProfileController } from './entity-profile.controller';
import { EntityProfileService } from './entity-profile.service';
import { EntityProfileRepository } from './entity-profile.repository';

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
import { Post, PostSchema } from '@app/common/database/schemas/post.schema';
import { AuthValidateModule } from '@app/common/auth-validate';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Doctor.name, schema: DoctorSchema },
      { name: Hospital.name, schema: HospitalSchema },
      { name: Center.name, schema: CenterSchema },
      { name: Post.name, schema: PostSchema },
    ]),
    AuthValidateModule,
  ],
  controllers: [EntityProfileController],
  providers: [EntityProfileService, EntityProfileRepository],
  exports: [EntityProfileService],
})
export class EntityProfileModule {}
