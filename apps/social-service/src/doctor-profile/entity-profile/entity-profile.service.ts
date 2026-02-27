// entity-profile.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Post } from '@app/common/database/schemas/post.schema';
import { PostStatus } from '@app/common/database/schemas/common.enums';
import { EntityProfileRepository } from './entity-profile.repository';
import { EntityType } from '../dto/get-entity-profile.dto';

@Injectable()
export class EntityProfileService {
  constructor(
    private readonly repo: EntityProfileRepository,
    @InjectModel(Post.name) private readonly postModel: Model<Post>,
  ) {}

  async getEntityProfile(id: string, type: EntityType) {
    switch (type) {
      case EntityType.DOCTOR:
        return this.getDoctorProfile(id);
      case EntityType.HOSPITAL:
        return this.getHospitalProfile(id);
      case EntityType.CENTER:
        return this.getCenterProfile(id);
    }
  }

  // ── Doctor ────────────────────────────────────────────────────────────────

  private async getDoctorProfile(id: string) {
    const doctor = await this.repo.findDoctorById(id);
    if (!doctor) throw new NotFoundException('doctor.NOT_FOUND');

    await this.repo.incrementDoctorViews(id);

    const posts = await this.postModel
      .find({
        authorId: doctor._id,
        authorType: 'doctor',
        status: { $in: [PostStatus.APPROVED, PostStatus.PUBLISHED] },
      })
      .sort({ createdAt: -1 })
      .lean();

    return {
      type: EntityType.DOCTOR,
      id: doctor._id,
      fullName: [doctor.firstName, doctor.middleName, doctor.lastName]
        .filter(Boolean)
        .join(' '),
      bio: doctor.bio || null,
      image: doctor.image || null,
      phones: doctor.phones,
      city: doctor.city,
      subcity: doctor.subcity,
      latitude: doctor.latitude || null,
      longitude: doctor.longitude || null,
      gender: doctor.gender,
      publicSpecialization: doctor.publicSpecialization,
      privateSpecialization: doctor.privateSpecialization,
      inspectionPrice: doctor.inspectionPrice || 0,
      inspectionDuration: doctor.inspectionDuration || 0,
      yearsOfExperience: this.calculateYears(doctor.yearsOfExperience),
      experienceStartDate: doctor.yearsOfExperience || null,
      rating: doctor.rating || 0,
      gallery: doctor.gallery ?? [],
      workingHours: doctor.workingHours || [],
      profileViews: doctor.profileViews || 0,
      isSubscribed: doctor.isSubscribed,
      insuranceCompanies: doctor.insuranceCompanies || [],
      hospitals: doctor.hospitals || [],
      centers: doctor.centers || [],
      posts: posts.map((p) => ({
        id: p._id,
        content: p.content,
        images: p.images || [],
        status: p.status,
        createdAt: p.createdAt,
      })),
    };
  }

  // ── Hospital ──────────────────────────────────────────────────────────────

  private async getHospitalProfile(id: string) {
    const hospital = await this.repo.findHospitalById(id);
    if (!hospital) throw new NotFoundException('hospital.NOT_FOUND');

    await this.repo.incrementHospitalViews(id);

    const posts = await this.postModel
      .find({
        authorId: hospital._id,
        authorType: 'hospital',
        status: { $in: [PostStatus.APPROVED, PostStatus.PUBLISHED] },
      })
      .sort({ createdAt: -1 })
      .lean();

    return {
      type: EntityType.HOSPITAL,
      id: hospital._id,
      name: hospital.name,
      bio: hospital.bio || null,
      image: hospital.image || null,
      gallery: hospital.gallery ?? [],
      address: hospital.address,
      phones: hospital.phones,
      city: hospital.cityId,
      category: hospital.category,
      hospitalStatus: hospital.hospitalstatus,
      hospitalSpecialization: hospital.hospitalSpecialization,
      rating: hospital.rating || 0,
      profileViews: hospital.profileViews || 0,
      isSubscribed: hospital.isSubscribed,
      insuranceCompanies: hospital.insuranceCompanies || [],
      latitude: hospital.latitude || null,
      longitude: hospital.longitude || null,
      posts: posts.map((p) => ({
        id: p._id,
        content: p.content,
        images: p.images || [],
        status: p.status,
        createdAt: p.createdAt,
      })),
    };
  }

  // ── Center ────────────────────────────────────────────────────────────────

  private async getCenterProfile(id: string) {
    const center = await this.repo.findCenterById(id);
    if (!center) throw new NotFoundException('center.NOT_FOUND');

    await this.repo.incrementCenterViews(id);

    const posts = await this.postModel
      .find({
        authorId: center._id,
        authorType: 'center',
        status: { $in: [PostStatus.APPROVED, PostStatus.PUBLISHED] },
      })
      .sort({ createdAt: -1 })
      .lean();

    return {
      type: EntityType.CENTER,
      id: center._id,
      name: center.name,
      bio: center.bio || null,
      image: center.image || null,
      address: center.address || null,
      gallery: center.gallery ?? [],
      phones: center.phones,
      city: center.cityId,
      centerSpecialization: center.centerSpecialization,
      rating: center.rating || 0,
      workingHours: center.workingHours || [],
      profileViews: center.profileViews || 0,
      isSubscribed: center.isSubscribed,
      latitude: center.latitude || null,
      longitude: center.longitude || null,
      posts: posts.map((p) => ({
        id: p._id,
        content: p.content,
        images: p.images || [],
        status: p.status,
        createdAt: p.createdAt,
      })),
    };
  }

  // ── Helper ────────────────────────────────────────────────────────────────

  private calculateYears(startDate: Date): number {
    if (!startDate) return 0;
    const today = new Date();
    const start = new Date(startDate);
    let years = today.getFullYear() - start.getFullYear();
    const monthDiff = today.getMonth() - start.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < start.getDate()))
      years--;
    return years;
  }

  // ── Gallery — Get ─────────────────────────────────────────────────────────

  async getGallery(id: string, type: EntityType): Promise<string[]> {
    switch (type) {
      case EntityType.DOCTOR:
        return this.repo.getDoctorGallery(id);
      case EntityType.HOSPITAL:
        return this.repo.getHospitalGallery(id);
      case EntityType.CENTER:
        return this.repo.getCenterGallery(id);
    }
  }
  // ── Gallery — Add ─────────────────────────────────────────────────────────

  async addGallery(
    id: string,
    type: EntityType,
    images: string[],
  ): Promise<string[]> {
    switch (type) {
      case EntityType.DOCTOR:
        return this.repo.addDoctorGallery(id, images);
      case EntityType.HOSPITAL:
        return this.repo.addHospitalGallery(id, images);
      case EntityType.CENTER:
        return this.repo.addCenterGallery(id, images);
    }
  }

  // ── Gallery — Remove specific images ─────────────────────────────────────

  async removeGallery(
    id: string,
    type: EntityType,
    images: string[],
  ): Promise<string[]> {
    switch (type) {
      case EntityType.DOCTOR:
        return this.repo.removeDoctorGallery(id, images);
      case EntityType.HOSPITAL:
        return this.repo.removeHospitalGallery(id, images);
      case EntityType.CENTER:
        return this.repo.removeCenterGallery(id, images);
    }
  }

  // ── Gallery — Clear all ───────────────────────────────────────────────────

  async clearGallery(id: string, type: EntityType): Promise<void> {
    switch (type) {
      case EntityType.DOCTOR:
        return this.repo.clearDoctorGallery(id);
      case EntityType.HOSPITAL:
        return this.repo.clearHospitalGallery(id);
      case EntityType.CENTER:
        return this.repo.clearCenterGallery(id);
    }
  }
}
