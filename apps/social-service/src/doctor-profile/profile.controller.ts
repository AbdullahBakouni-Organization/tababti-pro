// profile.controller.ts
import {
  Controller,
  Get,
  Patch,
  Delete,
  Body,
  Headers,
  UseInterceptors,
  UseGuards,
  Param,
  UploadedFile,
  Query,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { DoctorProfileService } from './profile.service';
import { JwtAuthGuard } from '@app/common/guards/jwt.guard';
import { RolesGuard } from '@app/common/guards/role.guard';
import { Roles } from '@app/common/decorator/role.decorator';
import { UserRole } from '@app/common/database/schemas/common.enums';
import { CurrentUser } from '@app/common/decorator/current-user.decorator';
import { ApiResponse } from '../common/response/api-response';

import { UpdateDoctorProfileDto } from './dto/update-doctor-profile.dto';
import { ApiConsumes } from '@nestjs/swagger';
import { memoryStorageConfig } from '@app/common/constant/images-dtos.constant';
import { PaginationDto } from './dto/pagination.dto';

@Controller('doctor/profile')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DoctorProfileController {
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

  @Get('main')
  @Roles(UserRole.DOCTOR)
  async getMainProfile(
    @CurrentUser('accountId') authAccountId: string,
    @Headers('accept-language') lang: 'en' | 'ar' = 'en',
  ) {
    const data = await this.doctorService.getMainProfile(authAccountId);
    return ApiResponse.success({ lang, messageKey: 'doctor.FETCHED', data });
  }

  @Patch('me')
  @Roles(UserRole.DOCTOR)
  @UseInterceptors(FileInterceptor('image', memoryStorageConfig))
  @ApiConsumes('multipart/form-data')
  async updateProfile(
    @CurrentUser('accountId') authAccountId: string,
    @Body() dto: UpdateDoctorProfileDto, // @Transform in DTO handles all parsing
    @UploadedFile() file?: Express.Multer.File,
    @Headers('accept-language') lang: 'en' | 'ar' = 'en',
  ) {
    const data = await this.doctorService.updateProfile(
      authAccountId,
      dto,
      file,
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

  @Get(':id/posts')
  async getDoctorPostsById(
    @Param('id') doctorId: string,
    @Query() pagination: PaginationDto,
    @Headers('accept-language') _lang: 'en' | 'ar' = 'en',
  ) {
    const posts = await this.doctorService.getDoctorPosts(
      doctorId,
      pagination.page,
      pagination.limit,
    );

    // return ApiResponse.success({
    //   lang,
    //   messageKey: 'post.LIST',
    //   posts,
    // });

    return posts;
  }

  @Get(':id/gallery')
  async getDoctorGalleryById(
    @Param('id') doctorId: string,
    @Query() pagination: PaginationDto,
    @Headers('accept-language') _lang: 'en' | 'ar' = 'en',
  ) {
    const data = await this.doctorService.getDoctorGallery(
      doctorId,
      pagination.page,
      pagination.limit,
    );

    return data;
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
