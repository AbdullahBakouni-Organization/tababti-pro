import { HttpStatus } from '@nestjs/common';
import { messages } from '../i18n/messages';

type Lang = 'en' | 'ar';

interface ApiResponseOptions<T = any> {
  lang?: Lang;
  messageKey: string;
  data?: T | null;
}

export class ApiResponse {
  static success<T = any>({
    lang = 'en',
    messageKey,
    data = null,
  }: ApiResponseOptions<T>) {
    return {
      success: true,
      message: ApiResponse.getMessage(lang, messageKey),
      data,
    };
  }

  static error({
    lang = 'en',
    messageKey,
  }: {
    lang?: Lang;
    messageKey: string;
    statusCode?: HttpStatus;
  }) {
    return {
      success: false,
      message: ApiResponse.getMessage(lang, messageKey),
      data: null,
    };
  }

  private static getMessage(lang: Lang, key: string): string {
    const keys = key.split('.');
    let result: any = messages[lang];
    for (const k of keys) {
      result = result?.[k];
    }
    return result ?? key;
  }
}
