import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Doctor } from '@app/common/database/schemas/doctor.schema';

@Injectable()
export class DoctorRepository {
    constructor(@InjectModel(Doctor.name) private readonly doctorModel: Model<Doctor>) { }

    async findByAuthAccountId(authAccountId: string): Promise<Doctor> {
        if (!Types.ObjectId.isValid(authAccountId)) throw new BadRequestException('doctor.INVALID_ID');
        const doctor = await this.doctorModel.findOne({ authAccountId: new Types.ObjectId(authAccountId) })
            .select('-password -twoFactorSecret')
            .lean();
        if (!doctor) throw new NotFoundException('doctor.NOT_FOUND');
        return doctor;
    }

    async updateByAuthAccountId(authAccountId: string, updateData: Partial<Doctor>): Promise<Doctor> {
        if (!Types.ObjectId.isValid(authAccountId)) throw new BadRequestException('doctor.INVALID_ID');

        const doctor = await this.doctorModel.findOneAndUpdate(
            { authAccountId: new Types.ObjectId(authAccountId) },
            { $set: updateData, updatedAt: new Date() },
            { new: true, select: '-password -twoFactorSecret' },
        ).lean();

        if (!doctor) throw new NotFoundException('doctor.NOT_FOUND');
        return doctor;
    }

    async deleteById(doctorId: string): Promise<void> {
        if (!Types.ObjectId.isValid(doctorId)) throw new BadRequestException('doctor.INVALID_ID');
        const result = await this.doctorModel.deleteOne({ _id: new Types.ObjectId(doctorId) });
        if (!result.deletedCount) throw new NotFoundException('doctor.NOT_FOUND');
    }
}