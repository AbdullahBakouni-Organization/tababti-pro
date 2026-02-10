import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  PrivateSpecialization,
  PrivateSpecializationSchema,
} from '@app/common/database/schemas/privatespecializations.schema';
import { SpecializationsService } from './specializations.service';
import { SpecializationsController } from './specializations.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: PrivateSpecialization.name,
        schema: PrivateSpecializationSchema,
      },
    ]),
  ],
  providers: [SpecializationsService],
  controllers: [SpecializationsController],
  exports: [SpecializationsService], 
})
export class SpecializationsModule {}
