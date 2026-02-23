import { Injectable, NotFoundException } from '@nestjs/common';
import { DoctorRepository } from './profile.repository';
import { Doctor } from '@app/common/database/schemas/doctor.schema';
import { Post } from '@app/common/database/schemas/post.schema';
import { Model, Types } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';

@Injectable()
export class DoctorProfileService {
    constructor(
        private readonly doctorRepo: DoctorRepository,
        @InjectModel(Post.name) private readonly postModel: Model<Post>,
    ) { }

    // ================= GET PROFILE =================
    async getProfile(authAccountId: string): Promise<any> {
        const doctor = await this.doctorRepo.findByAuthAccountId(authAccountId);
        if (!doctor) throw new NotFoundException('doctor.NOT_FOUND');

        // Fetch doctor's posts
        const posts = await this.postModel
            .find({ authorId: doctor._id, authorType: 'doctor' })
            .sort({ createdAt: -1 })
            .lean();

        return this.formatDoctor(doctor, posts);
    }

    // ================= UPDATE PROFILE =================
    async updateProfile(authAccountId: string, updateData: Partial<Doctor>): Promise<any> {
        const doctor = await this.doctorRepo.updateByAuthAccountId(authAccountId, updateData);
        if (!doctor) throw new NotFoundException('doctor.NOT_FOUND');

        const posts = await this.postModel
            .find({ authorId: doctor._id, authorType: 'doctor' })
            .sort({ createdAt: -1 })
            .lean();

        return this.formatDoctor(doctor, posts);
    }

    // ================= DELETE DOCTOR =================
    async deleteDoctor(doctorId: string): Promise<void> {
        const deleted = await this.doctorRepo.deleteById(doctorId);
        if (!deleted) throw new NotFoundException('doctor.NOT_FOUND');
    }

    // ================= FORMAT DOCTOR =================
    private formatDoctor(doctor: Doctor, posts: any[] = []) {
        return {
            id: doctor._id,
            fullName: [doctor.firstName, doctor.middleName, doctor.lastName].filter(Boolean).join(' '),
            bio: doctor.bio || '',
            phones: doctor.phones,
            image: doctor.image || null,
            certificateImage: doctor.certificateImage || null,
            licenseImage: doctor.licenseImage || null,
            city: doctor.city,
            subcity: doctor.subcity,
            publicSpecialization: doctor.publicSpecialization,
            privateSpecialization: doctor.privateSpecialization,
            gender: doctor.gender,
            yearsOfExperience: doctor.yearsOfExperience,
            workingHours: doctor.workingHours || [],
            inspectionPrice: doctor.inspectionPrice || 0,
            inspectionDuration: doctor.inspectionDuration || 0,
            posts: posts.map(p => ({
                id: p._id,
                content: p.content,
                images: p.images || [],
                status: p.status,
                subscriptionType: p.subscriptionType,
                createdAt: p.createdAt,
            })),
            sessions: doctor.sessions?.map(s => ({
                deviceName: s.deviceName,
                lastActivityAt: s.lastActivityAt,
                isActive: s.isActive,
            })) || [],
            maxSessions: doctor.maxSessions,
            status: doctor.status,
        };
    }
}