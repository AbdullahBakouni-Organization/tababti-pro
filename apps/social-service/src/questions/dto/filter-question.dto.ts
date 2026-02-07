import { IsIn, IsOptional, IsMongoId, IsArray } from 'class-validator';
import { Transform } from 'class-transformer';

export class FilterQuestionDto {
  @IsOptional()
  @IsIn(['allQuestions', 'answered', 'pending'])
  filter?: 'allQuestions' | 'answered' | 'pending';

  @IsOptional()
  @IsMongoId()
  publicSpecializationId?: string;

  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  @Transform(({ value }) => (Array.isArray(value) ? value : [value]))
  privateSpecializationIds?: string[];
}
