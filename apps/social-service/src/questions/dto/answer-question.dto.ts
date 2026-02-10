import { IsNotEmpty } from 'class-validator';

export class AnswerQuestionDto {
  @IsNotEmpty()
  content: string;
}
