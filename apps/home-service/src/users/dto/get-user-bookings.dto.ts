// get-user-bookings.dto.ts
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { BookingStatus } from '@app/common/database/schemas/common.enums';

export class GetUserBookingsDto {
  @ApiPropertyOptional({
    enum: BookingStatus,
    description: 'Filter bookings by status',
    example: BookingStatus.PENDING,
  })
  @IsOptional()
  @IsEnum(BookingStatus)
  status?: BookingStatus;

  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 10, default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 10;
}
