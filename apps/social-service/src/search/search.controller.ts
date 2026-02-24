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

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('cache/clear')
  clearCache() {
    this.searchService.clearCache();
    return { message: 'Cache cleared successfully' };
  }
}
