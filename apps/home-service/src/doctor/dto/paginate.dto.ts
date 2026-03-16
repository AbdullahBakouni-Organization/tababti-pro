import { Type } from 'class-transformer';
import { IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
export class PaginateDto {
  @ApiPropertyOptional({
    description: 'Page number (for pagination)',
    example: 1,
    default: 1,
  })
  @IsOptional()
  @Type(() => Number)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Number of items per page',
    example: 20,
    default: 20,
  })
  @IsOptional()
  @Type(() => Number)
  limit?: number = 20;
}
