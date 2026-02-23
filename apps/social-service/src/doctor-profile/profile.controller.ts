import {
    Controller,
    Get,
    Patch,
    Delete,
    Body,
    Headers,
    UploadedFiles,
    UseInterceptors,
    UseGuards,
    Logger,
    Param,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { DoctorProfileService } from './profile.service';
import { JwtAuthGuard } from '@app/common/guards/jwt.guard';
import { RolesGuard } from '@app/common/guards/role.guard';
import { Roles } from '@app/common/decorator/role.decorator';
import { UserRole } from '@app/common/database/schemas/common.enums';
import { CurrentUser } from '@app/common/decorator/current-user.decorator';
import { doctorImageOptions } from '@app/common/helpers/file-upload.helper';
import { ApiResponse } from '../common/response/api-response';

@Controller('doctor/profile')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DoctorProfileController {
    private readonly logger = new Logger(DoctorProfileController.name);

    constructor(private readonly doctorService: DoctorProfileService) { }

    @Get('me')
    @Roles(UserRole.DOCTOR)
    async getProfile(
        @CurrentUser('accountId') authAccountId: string,
        @Headers('accept-language') lang: 'en' | 'ar' = 'en',
    ) {
        const profile = await this.doctorService.getProfile(authAccountId);
        return ApiResponse.success({ lang, messageKey: 'doctor.FETCHED', data: profile });
    }

    @Patch('me')
    @Roles(UserRole.DOCTOR)
    @UseInterceptors(
        FileFieldsInterceptor(
            [
                { name: 'image', maxCount: 1 },
                { name: 'certificateImage', maxCount: 1 },
                { name: 'licenseImage', maxCount: 1 },
            ],
            doctorImageOptions,
        ),
    )
    async updateProfile(
        @CurrentUser('accountId') authAccountId: string,
        @Body() updateData: Partial<any>,
        @UploadedFiles() files?: {
            image?: Express.Multer.File[];
            certificateImage?: Express.Multer.File[];
            licenseImage?: Express.Multer.File[];
        },
        @Headers('accept-language') lang: 'en' | 'ar' = 'en',
    ) {
        if (files?.image?.length) updateData.image = files.image[0].path.replace(/\\/g, '/');
        if (files?.certificateImage?.length) updateData.certificateImage = files.certificateImage[0].path.replace(/\\/g, '/');
        if (files?.licenseImage?.length) updateData.licenseImage = files.licenseImage[0].path.replace(/\\/g, '/');

        const updatedProfile = await this.doctorService.updateProfile(authAccountId, updateData);
        return ApiResponse.success({ lang, messageKey: 'doctor.UPDATED', data: updatedProfile });
    }

    @Delete(':id')
    @Roles(UserRole.ADMIN)
    async deleteDoctor(@Param('id') doctorId: string, @Headers('accept-language') lang: 'en' | 'ar' = 'en') {
        await this.doctorService.deleteDoctor(doctorId);
        return ApiResponse.success({ lang, messageKey: 'doctor.DELETED', data: null });
    }
}