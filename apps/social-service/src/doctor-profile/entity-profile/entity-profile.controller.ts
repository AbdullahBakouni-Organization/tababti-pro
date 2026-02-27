// entity-profile.controller.ts
import { Controller, Get, Param, Query, Headers } from '@nestjs/common';
import { ApiTags, ApiQuery } from '@nestjs/swagger';
import { EntityProfileService } from './entity-profile.service';
import { EntityType, GetEntityProfileDto } from '../dto/get-entity-profile.dto';
import { ApiResponse } from '../../common/response/api-response';

@ApiTags('Entity Profile')
@Controller('entity/profile')
export class EntityProfileController {
  constructor(private readonly service: EntityProfileService) {}

  // ── GET /entity/profile/:id?type=doctor|hospital|center ──────────────────
  @Get(':id')
  @ApiQuery({ name: 'type', enum: EntityType, required: true })
  async getEntityProfile(
    @Param('id') id: string,
    @Query('type') type: EntityType,
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
