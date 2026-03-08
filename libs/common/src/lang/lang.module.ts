import { Module } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';
import { I18nValidationPipe } from '../pipes/i18n-validation.pipe';
import { LangMiddleware } from '../middlewares/lang.middleware';

@Module({
  providers: [
    LangMiddleware,
    {
      provide: APP_PIPE,
      useClass: I18nValidationPipe,
    },
  ],
  exports: [LangMiddleware],
})
export class LangModule {}
