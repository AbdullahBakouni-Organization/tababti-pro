import {
  IsIn,
  IsOptional,
  IsMongoId,
  IsArray,
  IsNumberString,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class FilterQuestionDto {
  @IsOptional()
  @IsIn(['allQuestions', 'answered', 'pending', 'main'])
  filter?: 'allQuestions' | 'answered' | 'pending' | 'main';

  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  @Transform(({ value }) => (Array.isArray(value) ? value : [value]))
  privateSpecializationIds?: string[];

  @IsOptional()
  @IsNumberString()
  page?: string;

  @IsOptional()
  @IsNumberString()
  limit?: string;
}
