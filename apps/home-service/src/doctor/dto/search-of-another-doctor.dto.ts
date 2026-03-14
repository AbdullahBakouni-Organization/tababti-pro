// search-doctors.dto.ts
import { IsOptional, IsString, MinLength } from 'class-validator';

export class SearchDoctorsDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  limit?: string;
}
