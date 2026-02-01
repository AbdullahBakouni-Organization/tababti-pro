import { Module } from '@nestjs/common';
import { SocialServiceController } from './social-service.controller';
import { SocialServiceService } from './social-service.service';

@Module({
  imports: [],
  controllers: [SocialServiceController],
  providers: [SocialServiceService],
})
export class SocialServiceModule {}
