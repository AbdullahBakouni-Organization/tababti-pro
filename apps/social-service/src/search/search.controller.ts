import {
  Controller,
  Get,
  Query,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SearchService } from './search.service';
import { SearchFilterDto } from './dto/search-filter.dto';
import { JwtAuthGuard } from '@app/common/guards/jwt.guard';

@ApiTags('Search')
@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  async search(
    @Query(new ValidationPipe({ whitelist: true, transform: true }))
    query: SearchFilterDto,
  ) {
    return this.searchService.filterEntitiesOptimized(query);
  }
}
