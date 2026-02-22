import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Doctor, DoctorDocument } from '@app/common/database/schemas/doctor.schema';

@Injectable()
export class DoctorRepository {
    constructor(
        @InjectModel(Doctor.name)
        private readonly doctorModel: Model<DoctorDocument>,
    ) { }

    async findById(id: string): Promise<DoctorDocument | null> {
        const doc = await this.doctorModel.findById(id);
        return doc as DoctorDocument | null;
    }

    async findByIdWithPassword(id: string): Promise<DoctorDocument | null> {
        const doc = await this.doctorModel.findById(id).select('+password');
        return doc as DoctorDocument | null;
    }

    async save(doctor: DoctorDocument) {
        return doctor.save();
    }

    async incrementField(id: string, field: 'profileViews' | 'searchCount') {
        return this.doctorModel.findByIdAndUpdate(id, { $inc: { [field]: 1 } });
    }
}