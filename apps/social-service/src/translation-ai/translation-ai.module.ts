import { Module } from '@nestjs/common';
import { TranslationAiService } from './translation-ai.service';
import { DatabaseModule } from '@app/common/database/database.module';

@Module({
  imports: [DatabaseModule],
  providers: [TranslationAiService],
  exports: [TranslationAiService],
})
export class TranslationAiModule {}
