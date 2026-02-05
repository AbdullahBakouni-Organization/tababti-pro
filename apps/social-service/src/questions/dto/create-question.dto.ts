import { IsString, IsMongoId, IsArray, ArrayNotEmpty } from 'class-validator';

export class CreateQuestionDto {
  @IsString()
  content: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsMongoId({ each: true })
  specializationId: string[];
}
