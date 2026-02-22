import { Controller, Get, Patch, Delete, Body, Param, Req, UseGuards } from '@nestjs/common';
import { DoctorProfileService } from './profile.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { JwtAuthGuard } from '@app/common/guards/jwt.guard';

@UseGuards(JwtAuthGuard)
@Controller('doctor/profile')
export class DoctorProfileController {
    constructor(private readonly doctorProfileService: DoctorProfileService) { }

    @Get('me')
    getProfile(@Req() req) {
        return this.doctorProfileService.getMyProfile(req.user.id);
    }

    @Patch('update')
    updateProfile(@Req() req, @Body() dto: UpdateProfileDto) {
        return this.doctorProfileService.updateProfile(req.user.id, dto);
    }

    @Patch('change-password')
    changePassword(@Req() req, @Body() dto: ChangePasswordDto) {
        return this.doctorProfileService.changePassword(req.user.id, dto);
    }

    @Patch('update-image')
    updateImage(@Req() req, @Body('image') image: string) {
        return this.doctorProfileService.updateProfileImage(req.user.id, image);
    }

    @Delete('logout-device/:deviceId')
    removeDevice(@Req() req, @Param('deviceId') deviceId: string) {
        return this.doctorProfileService.removeDevice(req.user.id, deviceId);
    }

    @Delete('logout-all')
    logoutAll(@Req() req) {
        return this.doctorProfileService.removeAllSessions(req.user.id);
    }

    @Get('stats')
    getStats(@Req() req) {
        return this.doctorProfileService.getProfileStats(req.user.id);
    }
}