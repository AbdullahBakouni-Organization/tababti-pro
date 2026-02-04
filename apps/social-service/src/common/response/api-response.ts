import { HttpStatus } from '@nestjs/common';
import { messages } from '../i18n/messages';

type Lang = 'en' | 'ar';

interface ApiResponseOptions<T> {
  lang?: Lang;
  messageKey: string; // example: 'question.CREATED'
  data?: T;
  statusCode?: HttpStatus;
}

export class ApiResponse {
  static success<T>({
    lang = 'en',
    messageKey,
    data,
    statusCode = HttpStatus.OK,
  }: ApiResponseOptions<T>) {
    return {
      status: true,
      statusCode,
      message: ApiResponse.getMessage(lang, messageKey),
      data,
    };
  }

  static error({
    lang = 'en',
    messageKey,
    statusCode = HttpStatus.BAD_REQUEST,
  }) {
    return {
      status: false,
      statusCode,
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

    return result || key;
  }
}
