// dto/approve-questions.dto.ts
import { IsArray, IsNotEmpty, IsString, ArrayMinSize } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ApproveQuestionsDto {
  @ApiProperty({
    type: [String],
    example: ['69c192cec80aba0ca3f8bd41', '69c192cec80aba0ca3f8bd42'],
  })
  @IsArray()
  @IsNotEmpty()
  @ArrayMinSize(1)
  @IsString({ each: true })
  questionIds: string[];
}
