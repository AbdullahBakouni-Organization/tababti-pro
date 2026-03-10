import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Query,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { SearchService } from './search.service';
import { SearchFilterDto } from './dto/search-filter.dto';
import { JwtAuthGuard } from '@app/common/guards/jwt.guard';
import { RolesGuard } from '@app/common/guards/role.guard';
import { UserRole } from '@app/common/database/schemas/common.enums';
import { Roles } from '@app/common/decorator/role.decorator';
import { SimilarDoctorsDto } from './dto/similira-doctor.dto';
import { ApiResponse as AppResponse } from '../common/response/api-response';
import { getLang } from '@app/common/helpers/get-lang.helper';

@ApiTags('Search')
@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}
  @UseGuards(JwtAuthGuard)
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Filter and search doctors' })
  @ApiOkResponse({
    description: 'Doctors retrieved successfully',
  })
  @ApiBadRequestResponse({
    description: 'Bad Request - Invalid query parameters',
  })
  async filterDoctors(
    @Query(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    )
    query: SearchFilterDto,
  ) {
    return this.searchService.searchAll(query);
  }

  @UseGuards(JwtAuthGuard)
  @Get('similar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get doctors with same private specialization',
    description:
      'Returns doctors sharing the same private specialization, sorted by rating.',
  })
  @ApiOkResponse({ description: 'Similar doctors retrieved successfully' })
  @ApiNotFoundResponse({ description: 'Doctor not found' })
  @ApiBadRequestResponse({ description: 'Invalid query parameters' })
  async getSimilarDoctors(
    @Query(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    )
    query: SimilarDoctorsDto,
  ) {
    const data = await this.searchService.getSimilarDoctors(query);
    return AppResponse.success({
      lang: getLang(),
      messageKey: 'common.SUCCESS',
      data,
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('cache/clear')
  clearCache() {
    this.searchService.clearCache();
    return { message: 'Cache cleared successfully' };
  }
}
