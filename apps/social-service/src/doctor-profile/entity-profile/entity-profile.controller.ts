import { Controller, Get, Param, Query, Body, Headers } from '@nestjs/common';

import { ApiTags, ApiQuery } from '@nestjs/swagger';

import { EntityProfileService } from './entity-profile.service';
import { EntityType } from '../dto/get-entity-profile.dto';

import { ApiResponse } from '../../common/response/api-response';
import { UserRole } from '@app/common/database/schemas/common.enums';

@ApiTags('Entity Profile')
@Controller('entity/profile')
export class EntityProfileController {
  constructor(private readonly service: EntityProfileService) {}

  // ─────────────────────────────────────────────
  // GET Full Profile
  // ─────────────────────────────────────────────
  @Get(':id')
  @ApiQuery({ name: 'type', enum: EntityType, required: true })
  async getEntityProfile(
    @Param('id') id: string,
    @Query('type') type: UserRole,
    @Headers('accept-language') lang: 'en' | 'ar' = 'en',
  ) {
    const data = await this.service.getEntityProfile(id, type);

    return ApiResponse.success({
      lang,
      messageKey: 'entity.PROFILE_FETCHED',
      data,
    });
  }
}
