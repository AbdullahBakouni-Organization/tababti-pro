import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PostService } from './post.service';
import { PostRepository } from './post.repository';
import { PostController } from './post.controller';
import { Post, PostSchema } from '@app/common/database/schemas/post.schema';
import { User, UserSchema } from '@app/common/database/schemas/user.schema';
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

import { MinioModule } from 'apps/home-service/src/minio/minio.module';
import { CacheModule } from '@app/common/cache/cache.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Post.name, schema: PostSchema },
      { name: User.name, schema: UserSchema },
      { name: Doctor.name, schema: DoctorSchema },
      { name: Hospital.name, schema: HospitalSchema },
      { name: Center.name, schema: CenterSchema },
    ]),
    MinioModule,
    CacheModule,
  ],
  controllers: [PostController],
  providers: [PostService, PostRepository],
  exports: [PostService],
})
export class PostModule {}
