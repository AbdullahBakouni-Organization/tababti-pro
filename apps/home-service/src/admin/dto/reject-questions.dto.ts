// dto/reject-questions.dto.ts
import { IsArray, IsNotEmpty, IsString, ArrayMinSize } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RejectQuestionsDto {
  @ApiProperty({
    type: [String],
    example: ['69c192cec80aba0ca3f8bd41'],
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  questionIds: string[];

  @ApiProperty({ example: 'Question violates community guidelines' })
  @IsString()
  @IsNotEmpty()
  reason: string;
}
