import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PostStatus } from '@app/common/database/schemas/common.enums';

export class UpdatePostStatusDto {
  @IsEnum([PostStatus.APPROVED, PostStatus.REJECTED])
  status: PostStatus.APPROVED | PostStatus.REJECTED;

  @IsOptional()
  @IsString()
  rejectionReason?: string;
}
