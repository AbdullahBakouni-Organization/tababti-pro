import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DoctorRepository } from './profile.repository';
import { Doctor } from '@app/common/database/schemas/doctor.schema';
import { Post } from '@app/common/database/schemas/post.schema';
import { Model, Types } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';
import { UpdateDoctorProfileDto } from './dto/update-doctor-profile.dto';
import {
  GeneralSpecialty,
  PrivateMedicineSpecialty,
} from '@app/common/database/schemas/common.enums';

@Injectable()
export class DoctorProfileService {
  constructor(
    private readonly doctorRepo: DoctorRepository,
    @InjectModel(Post.name) private readonly postModel: Model<Post>,
  ) {}

  // ================= GET PRIVATE PROFILE =================
  async getProfile(authAccountId: string): Promise<any> {
    const doctor = await this.doctorRepo.findByAuthAccountId(authAccountId);
    if (!doctor) throw new NotFoundException('doctor.NOT_FOUND');

    const posts = await this.postModel
      .find({ authorId: doctor._id, authorType: 'doctor' })
      .sort({ createdAt: -1 })
      .lean();

    return this.formatDoctor(doctor, posts);
  }

  async updateProfile(
    authAccountId: string,
    updateData: UpdateDoctorProfileDto,
  ): Promise<any> {
    // ===== Validate specialization match dynamically =====
    if (updateData.publicSpecialization && updateData.privateSpecialization) {
      // استخدم دالة repository أو قاعدة بيانات لتأكد من صحة العلاقة
      const isValidSpecialization =
        await this.doctorRepo.checkPrivateSpecializationMatchesPublic(
          updateData.publicSpecialization,
          updateData.privateSpecialization,
        );

      if (!isValidSpecialization) {
        throw new BadRequestException(
          'Private specialization does not match public specialization',
        );
      }
    }

    // ===== Validate subcity belongs to city =====
    if (updateData.subcity && updateData.city) {
      const isValidSubcity = await this.doctorRepo.checkSubcityBelongsToCity(
        updateData.subcity,
        updateData.city,
      );
      if (!isValidSubcity) {
        throw new BadRequestException(
          'Subcity does not belong to the specified city',
        );
      }
    }

    // ===== Update doctor in DB =====
    const doctor = await this.doctorRepo.updateByAuthAccountId(
      authAccountId,
      updateData as any, // سيتم تحويل الـ enums مباشرة عند الحفظ
    );

    if (!doctor) throw new NotFoundException('doctor.NOT_FOUND');

    // ===== Fetch doctor's posts =====
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

  // ================= FORMAT PRIVATE DOCTOR =================
  private formatDoctor(doctor: Doctor, posts: any[] = []) {
    return {
      id: doctor._id,
      fullName: [doctor.firstName, doctor.middleName, doctor.lastName]
        .filter(Boolean)
        .join(' '),
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
      posts: posts.map((p) => ({
        id: p._id,
        content: p.content,
        images: p.images || [],
        status: p.status,
        subscriptionType: p.subscriptionType,
        createdAt: p.createdAt,
      })),
      sessions:
        doctor.sessions?.map((s) => ({
          deviceName: s.deviceName,
          lastActivityAt: s.lastActivityAt,
          isActive: s.isActive,
        })) || [],
      maxSessions: doctor.maxSessions,
      status: doctor.status,
    };
  }

  // ================= GET PUBLIC PROFILE BY ID =================
  async getProfileById(doctorId: string): Promise<any> {
    const doctor = await this.doctorRepo.findById(doctorId);
    if (!doctor) throw new NotFoundException('doctor.NOT_FOUND');

    // Increment profile views
    await this.doctorRepo.incrementProfileViews(doctorId);

    const posts = await this.postModel
      .find({ authorId: doctor._id, authorType: 'doctor', status: 'published' })
      .sort({ createdAt: -1 })
      .lean();

    return this.formatPublicDoctor(doctor, posts);
  }

  // ================= FORMAT PUBLIC DOCTOR =================
  private formatPublicDoctor(doctor: Doctor, posts: any[] = []) {
    return {
      id: doctor._id,
      fullName: [doctor.firstName, doctor.middleName, doctor.lastName]
        .filter(Boolean)
        .join(' '),
      bio: doctor.bio || '',
      phones: doctor.phones,
      image: doctor.image || null,
      city: doctor.city,
      subcity: doctor.subcity,
      publicSpecialization: doctor.publicSpecialization,
      privateSpecialization: doctor.privateSpecialization,
      gender: doctor.gender,
      yearsOfExperience: doctor.yearsOfExperience,
      workingHours: doctor.workingHours || [],
      inspectionPrice: doctor.inspectionPrice || 0,
      inspectionDuration: doctor.inspectionDuration || 0,
      profileViews: doctor.profileViews || 0,
      posts: posts.map((p) => ({
        id: p._id,
        content: p.content,
        images: p.images || [],
        createdAt: p.createdAt,
      })),
    };
  }
}
