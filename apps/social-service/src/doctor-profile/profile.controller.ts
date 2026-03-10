// profile.controller.ts
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
  Param,
  Logger,
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
import {
  UpdateDoctorProfileDto,
  UploadedProfileFiles,
} from './dto/update-doctor-profile.dto';

@Controller('doctor/profile')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DoctorProfileController {
  private readonly logger = new Logger(DoctorProfileController.name);

  constructor(private readonly doctorService: DoctorProfileService) {}

  @Get('me')
  @Roles(UserRole.DOCTOR)
  async getProfile(
    @CurrentUser('accountId') authAccountId: string,
    @Headers('accept-language') lang: 'en' | 'ar' = 'en',
  ) {
    const data = await this.doctorService.getProfile(authAccountId);
    return ApiResponse.success({ lang, messageKey: 'doctor.FETCHED', data });
  }

  @Patch('me')
  @Roles(UserRole.DOCTOR)
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'image', maxCount: 1 },
        { name: 'certificateImage', maxCount: 1 },
        { name: 'licenseImage', maxCount: 1 },
        { name: 'galleryImages', maxCount: 10 },
      ],
      doctorImageOptions,
    ),
  )
  async updateProfile(
    @CurrentUser('accountId') authAccountId: string,
    @Body() dto: UpdateDoctorProfileDto, // @Transform in DTO handles all parsing
    @UploadedFiles()
    files: {
      image?: Express.Multer.File[];
      certificateImage?: Express.Multer.File[];
      licenseImage?: Express.Multer.File[];
      galleryImages?: Express.Multer.File[];
    } = {},
    @Headers('accept-language') lang: 'en' | 'ar' = 'en',
  ) {
    const norm = (f: Express.Multer.File): string => f.path.replace(/\\/g, '/');

    const uploadedFiles: UploadedProfileFiles = {
      image: files.image?.[0] ? norm(files.image[0]) : undefined,
      certificateImage: files.certificateImage?.[0]
        ? norm(files.certificateImage[0])
        : undefined,
      licenseImage: files.licenseImage?.[0]
        ? norm(files.licenseImage[0])
        : undefined,
      galleryImages: files.galleryImages?.map(norm) ?? [],
    };

    const data = await this.doctorService.updateProfile(
      authAccountId,
      dto,
      uploadedFiles,
    );

    return ApiResponse.success({ lang, messageKey: 'doctor.UPDATED', data });
  }

  @Get(':id')
  async getDoctorProfileById(
    @Param('id') doctorId: string,
    @Headers('accept-language') lang: 'en' | 'ar' = 'en',
  ) {
    const data = await this.doctorService.getProfileById(doctorId);
    return ApiResponse.success({ lang, messageKey: 'doctor.FETCHED', data });
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  async deleteDoctor(
    @Param('id') doctorId: string,
    @Headers('accept-language') lang: 'en' | 'ar' = 'en',
  ) {
    await this.doctorService.deleteDoctor(doctorId);
    return ApiResponse.success({
      lang,
      messageKey: 'doctor.DELETED',
      data: null,
    });
  }
}
