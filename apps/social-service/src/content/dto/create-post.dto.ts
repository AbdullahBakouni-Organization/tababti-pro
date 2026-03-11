import { IsEnum, IsOptional, IsString } from 'class-validator';
import {
  PostStatus,
  SubscriptionPlanType,
} from '@app/common/database/schemas/common.enums';

export class CreatePostDto {
  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsEnum(PostStatus)
  status?: PostStatus;

  @IsOptional()
  @IsEnum(SubscriptionPlanType)
  subscriptionType?: SubscriptionPlanType;

  @IsOptional()
  @IsString()
  images?: string;
}
