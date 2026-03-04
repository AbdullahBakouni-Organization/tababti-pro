import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum ModerationAction {
  APPROVE = 'approve',
  REJECT = 'reject',
}

export class ModerateQuestionDto {
  @ApiProperty({
    enum: ModerationAction,
    description:
      'approve → status becomes APPROVED; reject → status becomes REJECTED',
    example: ModerationAction.APPROVE,
  })
  @IsEnum(ModerationAction)
  action: ModerationAction;

  /**
   * Optional reason shown to the question author when rejected.
   * Ignored when action = approve.
   */
  @ApiPropertyOptional({
    description: 'Rejection reason (required when action = reject)',
    example: 'Question contains inappropriate content',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
