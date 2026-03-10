import { Controller, Get, Headers, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { SpecializationsService } from './specializations.service';
import { ApiResponse } from '../common/response/api-response';
import { RolesGuard } from '@app/common/guards/role.guard';
import { Roles } from '@app/common/decorator/role.decorator';
import { UserRole } from '@app/common/database/schemas/common.enums';
import { JwtAuthGuard } from '@app/common/guards/jwt.guard';
import { PaginationDto } from './dto/pagination.dto';

@ApiTags('Specializations')
@Controller('specializations')
export class SpecializationsController {
  constructor(private readonly service: SpecializationsService) {}

  @Get('dropdown')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DOCTOR, UserRole.HOSPITAL, UserRole.CENTER, UserRole.USER)
  @ApiBearerAuth()
  async getDropdown(@Headers('accept-language') lang: 'en' | 'ar' = 'en') {
    const data = await this.service.getDropdownList();
    return ApiResponse.success({
      lang,
      messageKey: 'specialization.LIST',
      data,
    });
  }

  // ── GET /specializations/paginated ────────────────────────────────────────
  @Get('paginated')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DOCTOR, UserRole.HOSPITAL, UserRole.CENTER, UserRole.USER)
  @ApiBearerAuth()
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getPaginated(
    @Query() query: PaginationDto,
    @Headers('accept-language') lang: 'en' | 'ar' = 'en',
  ) {
    const data = await this.service.getPaginatedList(query.page, query.limit);
    return ApiResponse.success({
      lang,
      messageKey: 'specialization.LIST',
      data,
    });
  }

  @Get('entities')
  async getEntities(@Headers('accept-language') lang: 'en' | 'ar' = 'en') {
    const data = await this.service.getEntities();
    return ApiResponse.success({
      lang,
      messageKey: 'entity.LIST',
      data,
    });
  }
}
