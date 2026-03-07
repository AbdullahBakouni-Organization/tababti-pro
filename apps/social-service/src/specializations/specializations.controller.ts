import { Controller, Get, Headers, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiHeader,
} from '@nestjs/swagger';
import { SpecializationsService } from './specializations.service';
import { ApiResponse } from '@app/common/response/api-response';
import { RolesGuard } from '@app/common/guards/role.guard';
import { Roles } from '@app/common/decorator/role.decorator';
import { UserRole } from '@app/common/database/schemas/common.enums';
import { JwtAuthGuard } from '@app/common/guards/jwt.guard';
import { PaginationDto } from './dto/pagination.dto';

type Lang = 'en' | 'ar';
function resolveLang(h?: string): Lang {
  return h === 'ar' ? 'ar' : 'en';
}

@ApiTags('Specializations')
@ApiHeader({
  name: 'accept-language',
  description: 'Response language: en | ar',
  required: false,
  schema: { default: 'en', enum: ['en', 'ar'] },
})
@Controller('specializations')
export class SpecializationsController {
  constructor(private readonly service: SpecializationsService) {}

  // ── GET /specializations/dropdown ─────────────────────────────────────────
  // Private specializations — flat list for select/autocomplete

  @Get('dropdown')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DOCTOR, UserRole.HOSPITAL, UserRole.CENTER, UserRole.USER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Private specializations — flat dropdown list' })
  async getDropdown(@Headers('accept-language') acceptLanguage?: string) {
    const lang = resolveLang(acceptLanguage);
    const data = await this.service.getDropdownList();
    return ApiResponse.success({
      lang,
      messageKey: 'specialization.LIST',
      data,
    });
  }

  // ── GET /specializations/paginated ────────────────────────────────────────
  // Private specializations — paginated

  @Get('paginated')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DOCTOR, UserRole.HOSPITAL, UserRole.CENTER, UserRole.USER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Private specializations — paginated list' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  async getPaginated(
    @Query() query: PaginationDto,
    @Headers('accept-language') acceptLanguage?: string,
  ) {
    const lang = resolveLang(acceptLanguage);
    const data = await this.service.getPaginatedList(query.page, query.limit);
    return ApiResponse.success({
      lang,
      messageKey: 'specialization.LIST',
      data,
    });
  }

  // ── GET /specializations/public ───────────────────────────────────────────
  // Public specializations — flat list (GeneralSpecialty enum values)

  @Get('public')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(
    UserRole.DOCTOR,
    UserRole.HOSPITAL,
    UserRole.CENTER,
    UserRole.USER,
    UserRole.ADMIN,
  )
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Public specializations — flat list',
    description:
      'Returns all GeneralSpecialty values stored in the DB (e.g. طب_بشري, طب_أسنان …)',
  })
  async getPublicList(@Headers('accept-language') acceptLanguage?: string) {
    const lang = resolveLang(acceptLanguage);
    const data = await this.service.getPublicList();
    return ApiResponse.success({
      lang,
      messageKey: 'specialization.LIST',
      data,
    });
  }

  // ── GET /specializations/public/with-private ──────────────────────────────
  // Public specializations — each with nested private children

  @Get('public/with-private')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(
    UserRole.DOCTOR,
    UserRole.HOSPITAL,
    UserRole.CENTER,
    UserRole.USER,
    UserRole.ADMIN,
  )
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Public specializations with nested private children',
    description:
      'Returns each public specialization with its private sub-specializations. Useful for two-level pickers.',
  })
  async getPublicWithPrivate(
    @Headers('accept-language') acceptLanguage?: string,
  ) {
    const lang = resolveLang(acceptLanguage);
    const data = await this.service.getPublicWithPrivate();
    return ApiResponse.success({
      lang,
      messageKey: 'specialization.LIST',
      data,
    });
  }

  // ── GET /specializations/entities ─────────────────────────────────────────

  @Get('entities')
  @ApiOperation({
    summary: 'Working entity types (Clinic, Hospital, Center …)',
  })
  async getEntities(@Headers('accept-language') acceptLanguage?: string) {
    const lang = resolveLang(acceptLanguage);
    const data = this.service.getEntities();
    return ApiResponse.success({ lang, messageKey: 'entity.LIST', data });
  }
}
