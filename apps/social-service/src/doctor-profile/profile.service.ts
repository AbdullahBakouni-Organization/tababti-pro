import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { DoctorRepository } from './profile.repository';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

@Injectable()
export class DoctorProfileService {
    constructor(private readonly doctorRepo: DoctorRepository) { }

    async getMyProfile(doctorId: string) {
        const doctor = await this.doctorRepo.findById(doctorId);
        if (!doctor) throw new NotFoundException('Doctor not found');
        return doctor;
    }

    async updateProfile(doctorId: string, dto: UpdateProfileDto) {
        const doctor = await this.doctorRepo.findById(doctorId);
        if (!doctor) throw new NotFoundException('Doctor not found');

        Object.assign(doctor, dto);
        await this.doctorRepo.save(doctor);
        return { message: 'Profile updated successfully' };
    }

    async changePassword(doctorId: string, dto: ChangePasswordDto) {
        const doctor = await this.doctorRepo.findByIdWithPassword(doctorId);
        if (!doctor) throw new NotFoundException();

        // safe call with !
        const isMatch = await doctor.comparePassword!(dto.currentPassword);
        if (!isMatch) throw new BadRequestException('Wrong password');

        doctor.password = dto.newPassword;
        await this.doctorRepo.save(doctor);
        return { message: 'Password changed successfully' };
    }

    async updateProfileImage(doctorId: string, imageUrl: string) {
        const doctor = await this.doctorRepo.findById(doctorId);
        if (!doctor) throw new NotFoundException('Doctor not found');

        doctor.image = imageUrl;
        await this.doctorRepo.save(doctor);
        return { message: 'Profile image updated successfully' };
    }

    async removeDevice(doctorId: string, deviceId: string) {
        const doctor = await this.doctorRepo.findById(doctorId);
        if (!doctor) throw new NotFoundException('Doctor not found');

        // safe call with !
        doctor.removeDevice!(deviceId);
        await this.doctorRepo.save(doctor);
        return { message: 'Device removed successfully' };
    }

    async removeAllSessions(doctorId: string) {
        const doctor = await this.doctorRepo.findById(doctorId);
        if (!doctor) throw new NotFoundException('Doctor not found');

        doctor.removeAllSessions!();
        await this.doctorRepo.save(doctor);
        return { message: 'All sessions removed successfully' };
    }

    async getProfileStats(doctorId: string) {
        const doctor = await this.doctorRepo.findById(doctorId);
        if (!doctor) throw new NotFoundException('Doctor not found');

        return {
            profileViews: doctor.profileViews || 0,
            searchCount: doctor.searchCount || 0,
            activeSessions: doctor.getActiveSessionsCount!(),
        };
    }

    async incrementProfileViews(doctorId: string) {
        await this.doctorRepo.incrementField(doctorId, 'profileViews');
    }
}