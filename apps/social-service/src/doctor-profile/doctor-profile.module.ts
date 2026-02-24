import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Doctor, DoctorSchema } from '@app/common/database/schemas/doctor.schema';
import { DoctorProfileController } from './profile.controller';
import { DoctorProfileService } from './profile.service';
import { DoctorRepository } from './profile.repository';

@Module({
    imports: [
        MongooseModule.forFeature([
            { name: Doctor.name, schema: DoctorSchema },
        ]),
    ],
    controllers: [DoctorProfileController],
    providers: [DoctorProfileService, DoctorRepository],
})
export class DoctorProfileModule { }