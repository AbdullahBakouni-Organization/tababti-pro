import { PrivateMedicineSpecialty } from '@app/common/database/schemas/common.enums';
import { IsString, IsMongoId, IsArray, ArrayNotEmpty } from 'class-validator';
import { InputType, Field } from '@nestjs/graphql';  // ← add this

export class CreateQuestionDto {
  @IsString()
  content: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsMongoId({ each: true })
  specializationId: (string | PrivateMedicineSpecialty)[];
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