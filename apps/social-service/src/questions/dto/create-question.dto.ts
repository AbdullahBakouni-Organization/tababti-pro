import {
  IsString,
  IsMongoId,
  IsArray,
  ArrayNotEmpty,
  IsOptional,
} from 'class-validator';
import { InputType, Field } from '@nestjs/graphql'; // ← add this

export class CreateQuestionDto {
  @IsString()
  content: string;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsMongoId({ each: true })
  specializationId?: string[];

  @IsMongoId()
  @IsOptional()
  unknownId?: string;
}

// ── GraphQL InputType ─────────────────────────────────────────────────────────
@InputType()
export class CreateQuestionInput {
  @Field()
  @IsString()
  content: string;

  @Field(() => [String])
  @IsArray()
  @ArrayNotEmpty()
  @IsMongoId({ each: true })
  specializationId: string[];
}
