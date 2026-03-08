import {
  IsIn,
  IsOptional,
  IsMongoId,
  IsArray,
  IsNumberString,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class FilterQuestionDto {
  @ApiPropertyOptional({
    enum: ['allQuestions', 'answered', 'pending', 'public'],
  })
  @IsOptional()
  @IsIn(['allQuestions', 'answered', 'pending', 'public'])
  filter?: 'allQuestions' | 'answered' | 'pending' | 'public';

  @ApiPropertyOptional({ description: 'Filter by a public specialization ID' })
  @IsOptional()
  @IsMongoId()
  publicSpecializationId?: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'Filter by one or more private specialization IDs (array)',
  })
  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  @Transform(({ value }) => (Array.isArray(value) ? value : [value]))
  privateSpecializationIds?: string[];

  @ApiPropertyOptional({
    description: 'Filter by a single private specialization ID (shorthand)',
  })
  @IsOptional()
  @IsMongoId()
  privateSpecializationId?: string;

  @IsOptional()
  @IsNumberString()
  page?: string;

  @IsOptional()
  @IsNumberString()
  limit?: string;
}
