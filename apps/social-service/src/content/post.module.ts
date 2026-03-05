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
    MongooseModule.forFeature([
      { name: Post.name, schema: PostSchema },
      { name: User.name, schema: UserSchema },
      { name: Doctor.name, schema: DoctorSchema },
      { name: Hospital.name, schema: HospitalSchema },
      { name: Center.name, schema: CenterSchema },
    ]),
  ],
  controllers: [PostController],
  providers: [
    PostService,
    PostRepository,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
  exports: [PostService],
})
export class PostModule {}
