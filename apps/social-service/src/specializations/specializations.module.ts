import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  PrivateSpecialization,
  PrivateSpecializationSchema,
} from '@app/common/database/schemas/privatespecializations.schema';
import { SpecializationsService } from './specializations.service';
import { SpecializationsController } from './specializations.controller';
import { CacheModule } from '@app/common/cache/cache.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: PrivateSpecialization.name,
        schema: PrivateSpecializationSchema,
      },
    ]),
    CacheModule,
  ],
  providers: [SpecializationsService],
  controllers: [SpecializationsController],
  exports: [SpecializationsService],
})
export class SpecializationsModule {}
