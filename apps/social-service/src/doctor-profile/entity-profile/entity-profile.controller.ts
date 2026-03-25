import {
  Controller,
  Get,
  Param,
  Query,
  Body,
  Headers,
  UseGuards,
} from '@nestjs/common';

import { ApiTags, ApiQuery } from '@nestjs/swagger';

import { EntityProfileService } from './entity-profile.service';
import { EntityType } from '../dto/get-entity-profile.dto';

import { ApiResponse } from '../../common/response/api-response';
import { UserRole } from '@app/common/database/schemas/common.enums';
import { JwtUserGuard } from '@app/common/guards/jwt-user.guard';
import { RolesGuard } from '@app/common/guards/role.guard';
import { Roles } from '@app/common/decorator/role.decorator';

@ApiTags('Entity Profile')
@Controller('entity/profile')
export class EntityProfileController {
  constructor(private readonly service: EntityProfileService) {}

  // ─────────────────────────────────────────────
  // GET Full Profile
  // ─────────────────────────────────────────────
  @UseGuards(JwtUserGuard, RolesGuard)
  @Roles(UserRole.USER, UserRole.DOCTOR)
  @Get(':id')
  @ApiQuery({ name: 'type', enum: EntityType, required: true })
  async getEntityProfile(
    @Param('id') id: string,
    @Query('type') type: UserRole,
    @Query('galleryPage') galleryPage: number = 1,
    @Query('galleryLimit') galleryLimit: number = 10,
    @Headers('accept-language') lang: 'en' | 'ar' = 'en',
  ) {
    const data = await this.service.getEntityProfile(
      id,
      type,
      +galleryPage,
      +galleryLimit,
    );

    return data;
  }
}
