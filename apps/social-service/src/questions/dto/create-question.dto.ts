import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsMongoId,
  IsArray,
  ArrayNotEmpty,
  IsOptional,
  MinLength,
} from 'class-validator';
import { InputType, Field } from '@nestjs/graphql';
import { PrivateMedicineSpecialty } from '@app/common/database/schemas/common.enums';

// ── REST DTO ──────────────────────────────────────────────────────────────────
export class CreateQuestionDto {
  @ApiPropertyOptional({
    description: 'Question text (required if no images)',
    example: 'What is the best treatment for headache?',
  })
  @IsOptional()
  @IsString()
  @MinLength(3)
  content?: string;

  @ApiProperty({
    type: [String],
    description: 'Specialization IDs',
    example: ['64f1a2b3c4d5e6f7a8b9c0d1'],
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsMongoId({ each: true })
  specializationId: (string | PrivateMedicineSpecialty)[];

  // ── Injected by controller after multer — not sent by client as JSON ──────
  // @IsOptional() tells class-validator to allow it when whitelist: true
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images?: string[];
}

// ── GraphQL InputType ─────────────────────────────────────────────────────────
@InputType()
export class CreateQuestionInput {
  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MinLength(3)
  content?: string;

  @Field(() => [String])
  @IsArray()
  @ArrayNotEmpty()
  @IsMongoId({ each: true })
  specializationId: string[];
}
